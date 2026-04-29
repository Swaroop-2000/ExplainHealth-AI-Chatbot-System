# EyeSense – AI Chatbot Assistant for Eye Disease Detection

EyeSense is an AI-powered web application that helps detect eye diseases using computer vision and provides an interactive chatbot interface for users to discuss their symptoms.

## Features

- Interactive chatbot interface for symptom collection
- AI-powered eye disease detection for both retinal and external eye images
- Explainable AI using Grad-CAM visualizations
- Doctor feedback system for improving predictions
- Secure database storage for predictions and feedback

## Project Structure

```
eyesense/
├── backend/
│   ├── models/           # AI model files
│   ├── static/          # Temporary storage for Grad-CAM images
│   ├── main.py          # FastAPI backend
│   ├── chatbot_flow.json # Chatbot conversation rules
│   ├── requirements.txt  # Python dependencies
│   └── Dockerfile       # Backend containerization
└── frontend/
    ├── src/
    │   ├── components/  # Reusable UI components
    │   ├── pages/       # Main page components
    │   └── App.jsx      # Main application component
    ├── package.json     # Frontend dependencies
    └── tailwind.config.js # Tailwind CSS configuration
```

## Prerequisites

- Python 3.9+
- Node.js 14+
- npm or yarn

## Installation

### Backend Setup

1. Create a Python virtual environment:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```

The backend will be available at `http://localhost:8000`

### Frontend Setup

1. Install Node.js dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

The frontend will be available at `http://localhost:3000`

## Docker Deployment

1. Build the backend Docker image:
   ```bash
   cd backend
   docker build -t eyesense-backend .
   ```

2. Run the backend container:
   ```bash
   docker run -p 8000:8000 eyesense-backend
   ```

## Usage

1. Access the user interface at `http://localhost:3000/user`
2. Start a conversation with the chatbot
3. Follow the prompts to describe symptoms
4. Upload an eye image when requested
5. Review the AI prediction and Grad-CAM visualization
6. For doctors: Access the feedback dashboard at `http://localhost:3000/doctor`

## API Endpoints

- `POST /predict` - Submit an eye image for analysis
- `POST /feedback` - Submit doctor feedback on predictions
- `POST /chatbot` - Handle chatbot interactions

## Database Schema

The application uses SQLite with the following tables:

- `predictions`: Stores AI predictions and confidence scores
- `feedback`: Stores doctor feedback and corrections
- `chats`: Stores chat history and user interactions

## Disclaimer

This AI assistant provides educational advice only. Please consult a licensed ophthalmologist for proper diagnosis and treatment.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details."# ExplainHealth-AI-Chatbot-System" 
