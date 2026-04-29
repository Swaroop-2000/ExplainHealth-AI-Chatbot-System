import React from "react";
import { useNavigate } from "react-router-dom";

export default function ContactUs() {
  const navigate = useNavigate();

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-text-light dark:text-text-dark min-h-screen flex flex-col">
      <div className="flex flex-1">

        {/* LEFT DARK ILLUSTRATION PANEL */}
        <div className="hidden md:flex flex-col justify-between p-12 lg:p-16 bg-background-dark relative overflow-hidden w-1/2">
          <div className="absolute inset-0 bg-primary/20 opacity-30 [mask-image:radial-gradient(ellipse_at_top_left,rgba(0,0,0,1)_0%,rgba(0,0,0,0)_70%)] animate-pulseGlow"></div>

          {/* Logo */}
          <div className="relative z-10 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-4xl">visibility</span>
            <span className="text-white text-xl font-bold">VisionGuard</span>
          </div>

          <div className="relative z-10 mt-20">
            <h1 className="text-white text-4xl font-bold leading-tight">
              We're here to help
            </h1>
            <p className="text-white/80 text-lg leading-relaxed mt-4 max-w-lg">
              Have questions about our services or need support? Reach out to us.
            </p>
          </div>

          <div className="relative z-10 text-white/50 text-sm mt-auto">
            © 2024 VisionGuard Inc. All rights reserved.
          </div>
        </div>

        {/* RIGHT FORM PANEL */}
        <div className="flex flex-col w-full md:w-1/2 p-8 md:p-12 lg:p-16">

          {/* NAVIGATION BAR */}
          <header className="mb-8 flex w-full items-center justify-between">
            <div className="flex items-center gap-3 md:hidden">
              <span className="material-symbols-outlined text-primary text-3xl">visibility</span>
              <span className="text-text-light dark:text-white text-lg font-bold">VisionGuard</span>
            </div>

            <nav className="flex items-center gap-6">
              <button
                className="text-subtle-light dark:text-subtle-dark hover:text-primary transition-colors"
                onClick={() => navigate("/about-us")}
              >
                About Us
              </button>

              <button
                className="text-primary font-bold border-b-2 border-primary pb-1"
                onClick={() => navigate("/contact-us")}
              >
                Contact Us
              </button>
            </nav>
          </header>

          {/* CONTACT FORM */}
          <div className="flex flex-col flex-1 justify-center animate-[fadeIn_0.8s_ease-out]">
            <div className="w-full max-w-lg mx-auto">
              <h1 className="text-3xl font-bold text-text-light dark:text-white">
                Contact Us
              </h1>
              <p className="mt-2 text-base text-subtle-light dark:text-subtle-dark">
                Fill out the form below and we'll get back to you shortly.
              </p>

              <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-8">
                <form className="flex flex-col gap-5">
                  {/* NAME */}
                  <div className="flex flex-col gap-2">
                    <label className="text-base font-medium">Full Name</label>
                    <input
                      className="form-input border border-gray-300 dark:border-gray-700 bg-transparent rounded-lg px-4 py-2"
                      placeholder="Enter your full name"
                      type="text"
                    />
                  </div>

                  {/* EMAIL */}
                  <div className="flex flex-col gap-2">
                    <label className="text-base font-medium">Email</label>
                    <input
                      className="form-input border border-gray-300 dark:border-gray-700 bg-transparent rounded-lg px-4 py-2"
                      placeholder="you@example.com"
                      type="email"
                    />
                  </div>

                  {/* SUBJECT */}
                  <div className="flex flex-col gap-2">
                    <label className="text-base font-medium">Subject</label>
                    <input
                      className="form-input border border-gray-300 dark:border-gray-700 bg-transparent rounded-lg px-4 py-2"
                      placeholder="How can we help?"
                      type="text"
                    />
                  </div>

                  {/* MESSAGE */}
                  <div className="flex flex-col gap-2">
                    <label className="text-base font-medium">Message</label>
                    <textarea
                      className="form-input border border-gray-300 dark:border-gray-700 bg-transparent rounded-lg px-4 py-2 h-28"
                      placeholder="Your message..."
                    ></textarea>
                  </div>

                  {/* SUBMIT BUTTON */}
                  <button className="glossy-button h-12 rounded-lg bg-primary text-white font-semibold shadow-md hover:bg-primary/90 transition-all">
                    Send Message
                  </button>
                </form>

                {/* CONTACT INFO */}
                <div className="flex flex-col gap-6 text-base">

                  <div className="p-6 rounded-lg bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 glossy-bg">
                    <h3 className="text-lg font-semibold">Contact Information</h3>

                    <div className="flex items-center gap-3 mt-3">
                      <span className="material-symbols-outlined text-primary">mail</span>
                      <span>support@visionguard.com</span>
                    </div>

                    <div className="flex items-center gap-3 mt-3">
                      <span className="material-symbols-outlined text-primary">call</span>
                      <span>+1 (202) 555-0191</span>
                    </div>

                    <div className="flex gap-3 mt-3">
                      <span className="material-symbols-outlined text-primary">location_on</span>
                      <p>123 Health Ave, Vision City, VC 45678</p>
                    </div>
                  </div>

                  {/* OFFICE HOURS */}
                  <div className="p-6 rounded-lg bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 glossy-bg">
                    <h3 className="text-lg font-semibold">Office Hours</h3>

                    <div className="flex items-center gap-3 mt-3">
                      <span className="material-symbols-outlined text-primary">schedule</span>
                      <div>
                        <p className="font-medium">Monday - Friday</p>
                        <p>9 AM - 5 PM (EST)</p>
                      </div>
                    </div>
                  </div>

                  {/* MAP */}
                  <iframe
                    className="rounded-lg border border-gray-300 dark:border-gray-700 shadow-sm"
                    width="100%"
                    height="160"
                    loading="lazy"
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.622956292211!2d-73.98785368459385!3d40.74844097932788"
                  ></iframe>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
