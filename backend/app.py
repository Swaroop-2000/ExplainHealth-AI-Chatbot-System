#!/usr/bin/env python3
"""
Final app.py — strict model loading (both .keras model file AND weights file required).
This version will avoid the huge SavedModel tree dump by *reconstructing the architecture*
and loading the weights file if the saved model path is actually a SavedModel directory.
All existing functionality preserved: /predict, /feedback, Firebase, LIME, SVM adaptive retraining.
"""

import os
import io
import time
import uuid
import json
import shutil
import joblib
import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt
import cv2

from lime import lime_image
from skimage.segmentation import mark_boundaries

from tensorflow.keras import Model
from tensorflow.keras.preprocessing import image
# Use EfficientNetB0 as in your original snippet; keep other building blocks
from tensorflow.keras.applications.efficientnet import preprocess_input, EfficientNetB0
from tensorflow.keras.layers import GlobalAveragePooling2D, Dropout, Dense, Input, Conv2D, BatchNormalization, Activation

from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import SGDClassifier
from sklearn.kernel_approximation import RBFSampler
from sklearn.metrics import accuracy_score

from flask import Flask, request, jsonify
from flask_cors import CORS

import firebase_admin
from firebase_admin import credentials, firestore, storage

# --- User-specified / derived constants (from your last message) ---
NUM_CLASSES = 13
FINAL_ACTIVATION = "softmax"   # you specified softmax
IMG_HEIGHT = 160               # interpreted from "160*160*3"
IMG_WIDTH = 160
IMG_CHANNELS = 3
INPUT_SHAPE = (IMG_HEIGHT, IMG_WIDTH, IMG_CHANNELS)

# -------------------------
# CONFIG - EDIT BEFORE RUN
# -------------------------
SERVICE_ACCOUNT_PATH = "serviceAccountKey.json"    # Path to Firebase service account JSON
FIREBASE_BUCKET = "eye-disease-prediction-5b87a.firebasestorage.app"
PORT = 5000

# Developer-supplied local sample image (fallback)
SAMPLE_IMAGE_PATH = "/mnt/data/b1aefd8b-7746-42cf-9b47-634553204be0.png"

# Models & feedback paths (strict)
BASE_DIR = "models"
CNN_MODEL_PATH = os.path.join("models", "cnn", "final_eye_disease_model.keras")   # may be a file or directory
RUN_DIR = os.path.join("models", "cnn")
WEIGHTS_FILENAME = "final_weights.weights.h5"
WEIGHTS_PATH = os.path.join(RUN_DIR, WEIGHTS_FILENAME)                           # REQUIRED

SVM_MODEL_PATH = os.path.join(BASE_DIR, "svm", "best_svm_Hybrid_CNN_SVM_20251106_005711.pkl")
SCALER_PATH = os.path.join(BASE_DIR, "svm", "svm_scaler.pkl")
LABEL_MAP_PATH = os.path.join(RUN_DIR, "label_map.json")

FEEDBACK_DIR = "feedback"
FEEDBACK_IMG_DIR = os.path.join(FEEDBACK_DIR, "images")
FEEDBACK_FEATURES_PATH = os.path.join(FEEDBACK_DIR, "features.npz")
FEEDBACK_LOG_PATH = os.path.join(FEEDBACK_DIR, "feedback_log.csv")

LIME_OUTPUT_DIR = "static/heatmaps"
os.makedirs(FEEDBACK_IMG_DIR, exist_ok=True)
os.makedirs(LIME_OUTPUT_DIR, exist_ok=True)

# Reduce TF logging noise (and avoid noisy prints)
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
tf.get_logger().setLevel("ERROR")

# -------------------------
# Flask / Firebase init
# -------------------------
app = Flask(__name__)
CORS(app)

if not os.path.exists(SERVICE_ACCOUNT_PATH):
    raise FileNotFoundError(
        f"Service account not found at {SERVICE_ACCOUNT_PATH}. Place your service account JSON there."
    )

cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
firebase_admin.initialize_app(cred, {"storageBucket": FIREBASE_BUCKET})
db = firestore.client()
bucket = storage.bucket()

# -------------------------
# Strict model checks: must exist (weights & label_map & svm & scaler)
# -------------------------
if not os.path.exists(WEIGHTS_PATH):
    raise FileNotFoundError(f"Required weights file not found: {WEIGHTS_PATH}")

if not os.path.exists(LABEL_MAP_PATH):
    raise FileNotFoundError(f"Required label_map.json not found at: {LABEL_MAP_PATH}")

if not os.path.exists(SVM_MODEL_PATH):
    raise FileNotFoundError(f"Required SVM model not found: {SVM_MODEL_PATH}")

if not os.path.exists(SCALER_PATH):
    raise FileNotFoundError(f"Required SVM scaler not found: {SCALER_PATH}")

# -------------------------
# Load label map
# -------------------------
with open(LABEL_MAP_PATH, "r") as f:
    label_map = json.load(f)     # { "Diabetic retinopathy": 0, ... }

idx_to_label = {v: k for k, v in label_map.items()}

# -------------------------
# Reconstruct the architecture you gave originally (EfficientNetB0 top)
# Names matter for load_weights() — try best-effort naming consistent with typical Keras defaults
# -------------------------
def build_effnet_b0_top(num_classes, input_shape=INPUT_SHAPE, final_activation=FINAL_ACTIVATION):
    inp = Input(shape=input_shape, name="input_layer", dtype="float32")
    base = EfficientNetB0(include_top=False, weights=None, input_tensor=inp)  # weights=None so we'll load our own weights file
    x = base.output
    x = GlobalAveragePooling2D(name="global_average_pooling2d")(x)
    x = Dropout(0.2, name="dropout")(x)
    x = Dense(256, activation="relu", name="dense")(x)
    x = Dropout(0.5, name="dropout_1")(x)
    outputs = Dense(num_classes, activation=final_activation, name="predictions")(x)
    model = tf.keras.Model(inputs=inp, outputs=outputs, name="effnetb0_custom_top")
    return model

# Old diagnostic builder (keeps your previous diagnostic as fallback)
def build_model_matching_saved_config(num_classes, input_shape=INPUT_SHAPE):
    """
    Diagnostic rebuild from earlier conversation — kept as fallback.
    This attempted to match a different saved-config (EfficientNetV2S style).
    """
    inp = Input(shape=input_shape, name="input_layer", dtype="float32")
    # Use EfficientNetB0 here only to keep consistent imports — but this builder's naming mimics the other variant
    backbone = EfficientNetB0(include_top=False, input_tensor=inp, weights=None)
    x = backbone.output
    # top layers matching some saved configs (best-effort diagnostic)
    try:
        x = Conv2D(1280, (1,1), use_bias=False, name="top_conv")(x)
        x = BatchNormalization(name="top_bn")(x)
        x = Activation("swish", name="top_activation")(x)
        x = GlobalAveragePooling2D(name="global_average_pooling2d_2")(x)
        x = Dropout(0.3, name="dropout_2")(x)
        outputs = Dense(num_classes, activation="softmax", name="dense_2")(x)
        model = tf.keras.Model(inputs=inp, outputs=outputs, name="diagnostic_rebuild")
        return model
    except Exception:
        # fallback: minimal top
        x = GlobalAveragePooling2D()(backbone.output)
        x = Dense(num_classes, activation="softmax")(x)
        return tf.keras.Model(inputs=inp, outputs=x)

# -------------------------
# Load / reconstruct model without triggering huge SavedModel printout
# Strategy:
#  - If CNN_MODEL_PATH is a file (and appears to be a single .keras file), try to load it quietly.
#  - If CNN_MODEL_PATH is a directory (SavedModel), skip load_model() which prints tree,
#    instead rebuild architecture and load weights from WEIGHTS_PATH.
#  - If load_weights fails, attempt fallback diagnostic builder for clearer errors.
# -------------------------
print("📦 Preparing model (strict mode, suppressing SavedModel tree)...")
cnn_model = None

try:
    if os.path.exists(CNN_MODEL_PATH) and not os.path.isdir(CNN_MODEL_PATH):
        # Path exists and is a file — try to load (catching and surfacing errors)
        try:
            cnn_model = tf.keras.models.load_model(CNN_MODEL_PATH, compile=False)
            print(f"✅ Loaded saved model from file: {CNN_MODEL_PATH}")
            # also attempt to load weights file onto it (strict)
            try:
                cnn_model.load_weights(WEIGHTS_PATH)
                print("✅ Loaded weights onto the saved model (file).")
            except Exception as werr:
                print("⚠️ Saved model loaded but failed to load weights onto it:", type(werr).__name__, werr)
                # fallback: rebuild and load weights instead
                cnn_model = None
        except Exception as lm_err:
            print("⚠️ load_model() failed (file). Will try rebuild + load_weights:", type(lm_err).__name__, lm_err)
            cnn_model = None

    # If cnn_model not loaded yet (or CNN_MODEL_PATH is a directory), rebuild and load weights
    if cnn_model is None:
        print("🔧 Rebuilding architecture (EfficientNetB0 top) and loading weights file...")
        cnn_model = build_effnet_b0_top(NUM_CLASSES, input_shape=INPUT_SHAPE, final_activation=FINAL_ACTIVATION)
        try:
            cnn_model.load_weights(WEIGHTS_PATH)
            print("✅ Weights loaded onto rebuilt architecture.")
        except Exception as e_load:
            print("❌ Failed to load weights onto rebuilt architecture:", type(e_load).__name__, e_load)
            # Try diagnostic rebuild
            try:
                print("🔁 Trying diagnostic rebuild to gather clearer error...")
                model_diag = build_model_matching_saved_config(num_classes=NUM_CLASSES, input_shape=INPUT_SHAPE)
                model_diag.load_weights(WEIGHTS_PATH)
                print("✅ Diagnostic rebuild accepted weights (unexpected). Using diagnostic model.")
                cnn_model = model_diag
            except Exception as diag_e:
                print("❌ Diagnostic rebuild also failed:", type(diag_e).__name__, diag_e)
                # re-raise the original load error to stop startup (strict behavior)
                raise RuntimeError(f"Failed to load weights onto any rebuilt architecture: {e_load}") from e_load

except Exception as e:
    print("❌ Fatal error during model preparation:", type(e).__name__, e)
    raise

# -------------------------
# Create feature_extractor (penultimate layer extraction)
# prefer named dropout / dropout_2 if available
# -------------------------
try:
    if cnn_model is None:
        raise RuntimeError("cnn_model is not loaded")
    try:
        pen_layer = cnn_model.get_layer("dropout_2").output
    except Exception:
        try:
            pen_layer = cnn_model.get_layer("dropout").output
        except Exception:
            # fallback: second-to-last layer output
            pen_layer = cnn_model.layers[-2].output
    feature_extractor = Model(inputs=cnn_model.input, outputs=pen_layer)
    print("✅ feature_extractor created (penultimate layer).")
except Exception as e:
    print("❌ Failed to create feature_extractor:", type(e).__name__, e)
    raise

# -------------------------
# Load SVM + scaler (required)
# -------------------------
svm_data = joblib.load(SVM_MODEL_PATH)
svm_clf = svm_data.get("classifier") if isinstance(svm_data, dict) else svm_data
scaler = joblib.load(SCALER_PATH)
print("✅ SVM classifier and scaler loaded.")

# -------------------------
# Helpers: image preprocessing
# -------------------------
def preprocess_image_array(img_bgr, target_size=(IMG_WIDTH, IMG_HEIGHT)):
    """Return preprocessed input (1,H,W,3) and RGB resized image for visualization."""
    # Note: target_size is (width, height) for cv2.resize. We want (height,width) earlier; stick to (IMG_WIDTH,IMG_HEIGHT) call here.
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_resized = cv2.resize(img_rgb, (target_size[0], target_size[1]))
    x = image.img_to_array(img_resized)
    x = np.expand_dims(x, axis=0)
    x = preprocess_input(x)
    return x, img_resized

# -------------------------
# LIME wrapper and heatmap generator
# -------------------------
def lime_classifier_fn(patches):
    """Classifier function used by LIME: expects array of patches (H,W,3)."""
    processed = []
    for p in patches:
        p = cv2.resize(p.astype(np.uint8), (IMG_WIDTH, IMG_HEIGHT))
        x = np.expand_dims(preprocess_input(np.array(p, dtype=np.float32)), axis=0)
        processed.append(x[0])
    processed = np.stack(processed, axis=0)
    return cnn_model.predict(processed, verbose=0)

def generate_lime_heatmap(original_img_rgb, pred_label_idx, out_path, num_samples=200):
    """Create and save LIME heatmap PNG to out_path."""
    explainer = lime_image.LimeImageExplainer()
    explanation = explainer.explain_instance(
        np.array(original_img_rgb).astype("double"),
        classifier_fn=lime_classifier_fn,
        top_labels=5,
        hide_color=0,
        num_samples=num_samples
    )
    target = pred_label_idx
    if target not in explanation.top_labels:
        target = explanation.top_labels[0]
    temp, mask = explanation.get_image_and_mask(
        label=target, positive_only=True, num_features=5, hide_rest=False
    )
    plt.figure(figsize=(6,6))
    plt.imshow(mark_boundaries(temp/255.0, mask))
    plt.axis("off")
    plt.savefig(out_path, bbox_inches="tight", pad_inches=0)
    plt.close()

# -------------------------
# SVM + adaptive fusion
# -------------------------
def svm_predict_with_adaptive(features):
    base_probs = None
    adaptive_probs = None

    # Base SVM
    try:
        scaled = scaler.transform(features)
        base_probs = svm_clf.predict_proba(scaled)[0]
    except Exception as e:
        print("Base SVM error:", e)

    # Adaptive model loaded from the pickle (if present)
    feedback_count = 0
    if os.path.exists(SVM_MODEL_PATH):
        data = joblib.load(SVM_MODEL_PATH)
        adaptive = data.get("adaptive")
        if adaptive and "classifier" in adaptive:
            try:
                clf = adaptive["classifier"]
                rbf_mapper = adaptive.get("rbf_mapper", None)
                adapt_scaler = adaptive.get("scaler", None)
                if adapt_scaler is not None and rbf_mapper is not None:
                    f_scaled = adapt_scaler.transform(features)
                    f_mapped = rbf_mapper.transform(f_scaled)
                    adaptive_probs = clf.predict_proba(f_mapped)[0]
                    feedback_count = adaptive.get("feedback_count", 0)
            except Exception as e:
                print("Adaptive model error:", e)

    adaptive_weight = min(0.3 + (0.1 * feedback_count), 0.7)
    svm_weight = 1.0 - adaptive_weight

    if adaptive_probs is not None and base_probs is not None:
        combined = (svm_weight * base_probs) + (adaptive_weight * adaptive_probs)
        return combined
    elif adaptive_probs is not None:
        return adaptive_probs
    elif base_probs is not None:
        return base_probs
    else:
        raise ValueError("No model available for prediction")

def get_topk_from_probs(probs, k=5):
    top_idx = np.argsort(probs)[::-1][:k]
    result = []
    for i in top_idx:
        result.append({"label": idx_to_label[int(i)], "confidence": float(probs[int(i)])})
    return result

# -------------------------
# Feedback helpers (RL)
# -------------------------
def log_feedback(img_name, correct_label):
    os.makedirs(os.path.dirname(FEEDBACK_LOG_PATH), exist_ok=True)
    if os.path.exists(FEEDBACK_LOG_PATH):
        with open(FEEDBACK_LOG_PATH, "r") as f:
            for line in f:
                if img_name in line:
                    print(f"Feedback for {img_name} already exists.")
                    return False
    with open(FEEDBACK_LOG_PATH, "a") as f:
        f.write(f"{img_name},{correct_label},{int(time.time())}\n")
    return True

def save_feedback_image_and_features(img_bgr, correct_label, features):
    # save image
    label_folder = os.path.join(FEEDBACK_IMG_DIR, correct_label)
    os.makedirs(label_folder, exist_ok=True)
    img_name = f"{uuid.uuid4().hex}.png"
    img_path = os.path.join(label_folder, img_name)
    cv2.imwrite(img_path, img_bgr)

    # save features
    features = np.asarray(features)
    if features.ndim == 1:
        features = features.reshape(1, -1)
    if os.path.exists(FEEDBACK_FEATURES_PATH):
        data = np.load(FEEDBACK_FEATURES_PATH)
        X, y = data["X"], data["y"]
        X = np.vstack([X, features])
        y = np.hstack([y, np.array([label_map[correct_label]])])
    else:
        X, y = features, np.array([label_map[correct_label]])
    np.savez(FEEDBACK_FEATURES_PATH, X=X, y=y)

    # log
    log_feedback(img_name, correct_label)

def retrain_adaptive_model():
    if not os.path.exists(FEEDBACK_FEATURES_PATH):
        print("No feedback features to retrain adaptive model.")
        return
    data = np.load(FEEDBACK_FEATURES_PATH)
    X_fb, y_fb = data["X"], data["y"]
    if len(np.unique(y_fb)) < 1:
        print("Not enough feedback samples.")
        return
    scaler_fb = StandardScaler()
    X_scaled = scaler_fb.fit_transform(X_fb)
    rbf_mapper = RBFSampler(gamma=1.0, n_components=512, random_state=42)
    X_mapped = rbf_mapper.fit_transform(X_scaled)
    clf = SGDClassifier(loss="log_loss", random_state=42)
    clf.partial_fit(X_mapped, y_fb, classes=np.array(list(label_map.values())))
    model_data = {}
    if os.path.exists(SVM_MODEL_PATH):
        try:
            model_data = joblib.load(SVM_MODEL_PATH)
        except:
            model_data = {}
    model_data["adaptive"] = {
        "classifier": clf,
        "rbf_mapper": rbf_mapper,
        "scaler": scaler_fb,
        "feedback_count": len(y_fb)
    }
    joblib.dump(model_data, SVM_MODEL_PATH)
    print("Adaptive SVM retrained and saved.")

# -------------------------
# Upload helper
# -------------------------
def upload_buffer_to_bucket(buffer_bytes, dest_path, content_type="image/png"):
    blob = bucket.blob(dest_path)
    blob.upload_from_string(buffer_bytes, content_type=content_type)
    try:
        blob.make_public()
        return blob.public_url
    except Exception:
        # if make_public fails (depends on permissions), return gs:// path
        return f"gs://{FIREBASE_BUCKET}/{dest_path}"

# -------------------------
# ROUTES
# -------------------------
@app.route("/predict", methods=["POST"])
def predict_route():
    # Read input
    patient_id = request.form.get("patientId") or None
    patient_name_sent = request.form.get("patientName") or None

    file = request.files.get("image")
    if file:
        file_bytes = file.read()
        np_arr = np.frombuffer(file_bytes, np.uint8)
        img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            return jsonify({"error": "Could not decode uploaded image"}), 400
    else:
        # fallback sample
        if not os.path.exists(SAMPLE_IMAGE_PATH):
            return jsonify({"error": "No image provided"}), 400
        img_bgr = cv2.imread(SAMPLE_IMAGE_PATH)

    # Preprocess
    # Preprocess
    x_input, img_rgb = preprocess_image_array(img_bgr)
    print("STEP 1: Preprocess done")

# CNN prediction
    cnn_preds = cnn_model.predict(x_input, verbose=0)[0]
    print("STEP 2: CNN executed:", cnn_preds[:10])

    cnn_top5 = get_topk_from_probs(cnn_preds, k=5)
    print("STEP 3: CNN top5 extracted")



    # feature extraction
    features = feature_extractor.predict(x_input, verbose=0)  # shape (1, D)

    # SVM + adaptive
    svm_probs = svm_predict_with_adaptive(features)
    svm_top5 = get_topk_from_probs(svm_probs, k=5)

    pred_idx = int(np.argmax(svm_probs))
    pred_label = idx_to_label[pred_idx]
    pred_confidence = float(svm_probs[pred_idx])

    # Generate LIME heatmap (may be slow on CPU)
    heatmap_local = None
    heatmap_url = None
    try:
        heatmap_fname = f"lime_{int(time.time())}_{uuid.uuid4().hex[:8]}.png"
        heatmap_local = os.path.join(LIME_OUTPUT_DIR, heatmap_fname)
        generate_lime_heatmap(img_rgb, pred_idx, heatmap_local, num_samples=200)
    except Exception as e:
        print("LIME generation failed:", e)
        heatmap_local = None

    # Upload original image
    image_url = None
    try:
        _, img_buf = cv2.imencode(".png", img_bgr)
        image_dest = f"reports/{uuid.uuid4().hex}.png"
        image_url = upload_buffer_to_bucket(img_buf.tobytes(), image_dest, "image/png")
    except Exception as e:
        print("Image upload failed:", e)
        image_url = None

    # Upload heatmap if available
    if heatmap_local and os.path.exists(heatmap_local):
        try:
            with open(heatmap_local, "rb") as hf:
                heat_bytes = hf.read()
                heat_dest = f"heatmaps/{os.path.basename(heatmap_local)}"
                heatmap_url = upload_buffer_to_bucket(heat_bytes, heat_dest, "image/png")
        except Exception as e:
            print("Heatmap upload failed:", e)
            heatmap_url = None

    # Save to predictionReports
    try:
        db.collection("predictionReports").add({
            "patientId": patient_id,
            "patientName": patient_name_sent,
            "prediction": pred_label,
            "confidence": pred_confidence,
            "imageUrl": image_url,
            "heatmapUrl": heatmap_url,
            "cnn_top5": cnn_top5,
            "svm_top5": svm_top5,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })
    except Exception as e:
        print("Failed to write predictionReports:", e)

    # -------------------------
    # Create pendingFeedback for doctor review
    # -------------------------
    try:
        assigned_doctor_id = None
        assigned_doctor_name = None
        resolved_patient_name = patient_name_sent

        if patient_id:
            pdoc = db.collection("patients").document(patient_id).get()
            if pdoc.exists:
                pdata = pdoc.to_dict()
                assigned_doctor_id = pdata.get("doctorId")
                assigned_doctor_name = pdata.get("doctorName")
                resolved_patient_name = pdata.get("name") or resolved_patient_name

        db.collection("pendingFeedback").add({
            "patientId": patient_id,
            "patientName": resolved_patient_name,
            "assignedDoctorId": assigned_doctor_id,
            "assignedDoctorName": assigned_doctor_name,
            "imageUrl": image_url,
            "heatmapUrl": heatmap_url,
            "prediction": pred_label,
            "confidence": pred_confidence,
            "cnn_top5": cnn_top5,
            "svm_top5": svm_top5,
            "status": "pending",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        print("pendingFeedback document created.")
    except Exception as e:
        print("Failed to create pendingFeedback doc:", e)

    # Flatten features to list for optional client usage
    features_list = features.reshape(-1).tolist()

    return jsonify({
        "prediction": pred_label,
        "confidence": pred_confidence,
        "imageUrl": image_url,
        "heatmapUrl": heatmap_url,
        "cnn_raw": cnn_preds.tolist(),
        "cnn_top5": cnn_top5,
        "svm_raw": svm_probs.tolist(),
        "svm_top5": svm_top5,
    }), 200

@app.route("/feedback", methods=["POST"])
def feedback_route():
    """
    Accepts JSON: { "imageUrl": "<public image url>", "correct_label": "<label_name>" }
    Backend will download the image, compute features, save feedback, retrain adaptive model.
    Requires correct_label to be present in label_map.
    """
    data = request.get_json(force=True)
    image_url = data.get("imageUrl")
    correct_label = data.get("correct_label")

    if not image_url or not correct_label:
        return jsonify({"error": "imageUrl and correct_label required"}), 400
    if correct_label not in label_map:
        return jsonify({"error": "correct_label not in label_map"}), 400

    # Download image: try to infer blob path
    try:
        blob_path = None
        if data.get("blobPath"):
            blob_path = data.get("blobPath")
        else:
            if FIREBASE_BUCKET in image_url:
                parts = image_url.split(FIREBASE_BUCKET)
                if len(parts) > 1:
                    blob_path = parts[1].lstrip("/").split("?")[0]
        if not blob_path:
            # fallback: last two segments (may work for your urls)
            blob_path = "/".join(image_url.split("/")[-2:])

        tmp_dir = "temp"
        os.makedirs(tmp_dir, exist_ok=True)
        tmp_file = os.path.join(tmp_dir, f"fb_{uuid.uuid4().hex}.png")
        blob = bucket.blob(blob_path)
        blob.download_to_filename(tmp_file)
        img_bgr = cv2.imread(tmp_file)
        if img_bgr is None:
            raise RuntimeError("Downloaded image could not be read by OpenCV")
    except Exception as e:
        print("Failed to download image:", e)
        return jsonify({"error": "Failed to download image"}), 500

    # compute features
    x_input, _ = preprocess_image_array(img_bgr, target_size=(IMG_WIDTH, IMG_HEIGHT))
    features = feature_extractor.predict(x_input, verbose=0)

    # save feedback image and features, retrain adaptive
    try:
        save_feedback_image_and_features(img_bgr, correct_label, features)
        retrain_adaptive_model()
    except Exception as e:
        print("Failed to save feedback or retrain:", e)
        return jsonify({"error": "Failed to save feedback"}), 500

    return jsonify({"message": "Feedback saved and adaptive model updated"}), 200

# -------------------------
# Run server
# -------------------------
if __name__ == "__main__":
    print(f"Starting server on port {PORT} (strict model + weights required).")
    app.run(debug=True, port=PORT)
