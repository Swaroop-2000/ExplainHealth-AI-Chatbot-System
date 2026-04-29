// src/pages/AboutUs.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function AboutUs() {
  const navigate = useNavigate();

  return (
    <div className="bg-background-dark text-text-dark font-display min-h-screen">
      {/* ---------------- HEADER ---------------- */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background-dark/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <span className="material-symbols-outlined text-primary text-3xl">visibility</span>
            <span className="text-white text-lg font-bold">VisionGuard</span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-8">
            <button
              onClick={() => navigate("/about")}
              className="text-primary font-semibold hover:text-primary transition"
            >
              About Us
            </button>

            <button
    onClick={() => navigate("/contact-us")}
    className="text-subtle-light dark:text-subtle-dark hover:text-primary transition"
  >
              Contact Us
            </button>
          </nav>

          <button
            onClick={() => navigate("/")}
            className="h-10 px-5 rounded-lg bg-primary text-white text-sm font-semibold shadow-md hover:bg-primary/90 transition"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* ---------------- HERO ---------------- */}
      <section className="text-center py-20 glossy-bg">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white">
          Pioneering Vision Health Through Technology
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-lg text-subtle-dark leading-relaxed">
          We are dedicated to revolutionizing eye care by providing accessible and accurate early-stage disease detection, empowering individuals and healthcare professionals to protect and preserve sight.
        </p>
      </section>

      {/* ---------------- MISSION + VISION ---------------- */}
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-10 mt-10">
        
        {/* Mission Card */}
        <div className="rounded-xl p-8 glossy-card shadow-[inset_0_0_20px_rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-primary text-4xl">rocket_launch</span>
            <h2 className="text-2xl font-bold text-white">Our Mission</h2>
          </div>
          <p className="mt-4 text-base text-subtle-dark">
            To make early eye disease detection universally accessible through state-of-the-art AI technology, preventing vision loss and improving quality of life for people worldwide
          </p>
        </div>

        {/* Vision Card */}
        <div className="rounded-xl p-8 glossy-card shadow-[inset_0_0_20px_rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-primary text-4xl">visibility</span>
            <h2 className="text-2xl font-bold text-white">Our Vision</h2>
          </div>
          <p className="mt-4 text-base text-subtle-dark">
            A future where preventable blindness is a thing of a past, where technology serves as a vigilant guardian of sight, enabling proactive and personalized eye care for everyone.
          </p>
        </div>
      </div>

      {/* ---------------- TEAM ---------------- */}
      <section className="max-w-7xl mx-auto px-6 mt-24 text-center">
        <h2 className="text-3xl font-bold text-white">The Minds Behind the Mission</h2>
        <p className="mt-3 text-subtle-dark">
          Our team is a blend of ophthalmologists, AI researchers, and engineering experts.
        </p>

        {/* Team Grid */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-10">
          {[
            {
              name: "Dr. Aris Thorne",
              role: "Chief Medical Officer",
              img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDNB76oGxCEaWR1Pn3EdnFQSTEBC6PsM7wTe9tIC4eaZh4MmzQ4mDhr46YZuBjuObh55RbXoOacpYr4YUFr79UpO7CCeq3_BolsTbwV4hLLDwznjAQ_N3QxJbp2XK6w05lPbpimXarsf4EtGoPwcgQScLS7IX0avYhE3aBNEfRypiMt20HV6suAxCzkXe_T2ZbKmJxcycFhYFTZks8XTsAs86dDr_3YCEiv1C5Ofrl5R9gxHuPphGKAosDjaN4S9wLySGtu2vDBu-0"
            },
            {
              name: "Dr. Lena Petrova",
              role: "Lead AI Researcher",
              img: "https://lh3.googleusercontent.com/aida-public/AB6AXuA5iiwHrBaMCs3ZfOrCW6SYX-CZql6mCCTvvPQff7TPzU8y3L-X9_Rn9tcUNgScIL95HrKFuXjbp40hbx57KVy2FHtEJ3XLzu3oz8N3nM8h395rCvG8a8RMi-erEMQ5LAe05cLjND_XYREpJ_Jbi8QAAWlf5VU1O6GB_-Uq0J4cw14GLAZBXGPsb-FS9f0M18R9vIoKGubjO7hTu09bJlt5lX5NKSwqNbGbrB2cejbusV_44pjUcSjfe6t7lJJIHomqhy4SLeVXU6Y"
            },
            {
              name: "Kenji Tanaka",
              role: "Head of Engineering",
              img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBJoXlBxQNMThlkZ_XIm0_ymSLgl-UZiS2DJ_aRD_gHj_xV5WQbJVc6AkyMLrKfnbxxgSmi_XgHL-4OdCQOn-FuN7gQxGIHcVXapmdD1yPWRXF987CZybXyND89zIhRXMwg1gxw0Bij9ZBp6DUAQXj75CEy3s5zdIj8TeUfoPFM3ktXj5aR0mf87xlE7iyW7gNjLJ7X62EmN2cUlm0Fg_8F9YuTusWTMTYyNzSBbRV8DOM1DdlOfR5Yk6HxOT5rjNai9_UFDFSpkUE"
            },
            {
              name: "Sofia Reyes",
              role: "Product Lead",
              img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBstfDZS29DJQGZMndKNaZvwVYcbNs5HHjYMVhDyflYVdNOtRvTb9wd_jjLQNAI9yydMPyxXXwUbSMSTrzIjRicaDfYl7JYo-sTKwm54U1wdpY7hyySchvJIdKez_fszYQpDC0CSLZ6EOh92sUYDAiW-s9-y81Ih17CqBRbdHWbqkoBQI-TI3R5imi-LjPxybbfIxCGzZl46qt_Wj-r0GhPlnB0sR681XWQNNrp1bvY1_edSyBlomBF2uQ8l3FdoY3BMOoYu3mWcNc"
            }
          ].map((m, i) => (
            <div key={i} className="text-center">
              <img
                src={m.img}
                alt={m.name}
                className="mx-auto h-32 w-32 rounded-full object-cover border-4 border-primary/20"
              />
              <h3 className="mt-4 text-xl font-semibold text-white">{m.name}</h3>
              <p className="text-primary">{m.role}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- TECHNOLOGY SECTION ---------------- */}
      {/* ---------------- TECHNOLOGY SECTION ---------------- */}
<section className="max-w-7xl mx-auto px-6 mt-24 mb-20">
  <div className="rounded-xl p-12 glossy-bg shadow-[inset_0_0_40px_rgba(255,255,255,0.05)]">

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

      {/* LEFT — Title + Paragraph */}
      <div className="lg:col-span-1">
        <h2 className="text-3xl lg:text-4xl font-bold text-white">
          Our Technology
        </h2>

        <p className="mt-4 text-base text-subtle-dark leading-7">
          We harness the power of deep learning and computer vision to analyze 
          retinal images with superhuman precision. Our platform is built on a 
          scalable, secure, and compliant cloud infrastructure.
        </p>
      </div>

      {/* RIGHT — Feature Cards GRID */}
      <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Card 1 */}
        <div className="rounded-xl p-6 glossy-card shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]">
          <span className="material-symbols-outlined text-primary text-3xl">
            neurology
          </span>

          <h3 className="mt-3 text-lg font-semibold text-white">Neural Networks</h3>

          <p className="mt-2 text-sm text-subtle-dark">
            Advanced convolutional neural networks (CNNs) trained on millions of 
            retinal images to identify subtle pathological indicators.
          </p>
        </div>

        {/* Card 2 */}
        <div className="rounded-xl p-6 glossy-card shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]">
          <span className="material-symbols-outlined text-primary text-3xl">
            data_object
          </span>

          <h3 className="mt-3 text-lg font-semibold text-white">Vast Datasets</h3>

          <p className="mt-2 text-sm text-subtle-dark">
            Our models are ethically trained on diverse, large-scale datasets, 
            ensuring high accuracy and reducing bias.
          </p>
        </div>

        {/* Card 3 */}
        <div className="rounded-xl p-6 glossy-card shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]">
          <span className="material-symbols-outlined text-primary text-3xl">
            security
          </span>

          <h3 className="mt-3 text-lg font-semibold text-white">
            Secure &amp; Compliant
          </h3>

          <p className="mt-2 text-sm text-subtle-dark">
            Built with patient privacy at its core, adhering to HIPAA and GDPR 
            standards for data protection.
          </p>
        </div>

        {/* Card 4 */}
        <div className="rounded-xl p-6 glossy-card shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]">
          <span className="material-symbols-outlined text-primary text-3xl">
            cloud
          </span>

          <h3 className="mt-3 text-lg font-semibold text-white">
            Cloud Infrastructure
          </h3>

          <p className="mt-2 text-sm text-subtle-dark">
            Leveraging robust cloud services for high availability, scalability, 
            and seamless integrations with healthcare systems.
          </p>
        </div>

      </div>
    </div>
  </div>
</section>


      {/* ---------------- FOOTER ---------------- */}
      <footer className="border-t border-border-light dark:border-border-dark/50 py-8">
  <div className="max-w-7xl mx-auto px-6">

    <div className="flex items-center justify-between w-full text-sm text-subtle-dark">

      {/* LEFT — LOGO */}
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="material-symbols-outlined text-primary text-xl">visibility</span>
        <span className="text-white font-bold">VisionGuard</span>
      </div>

      {/* CENTER — LINKS */}
      <div className="flex items-center gap-6 whitespace-nowrap">
        <a href="#" className="hover:text-primary transition">Privacy Policy</a>
        <a href="#" className="hover:text-primary transition">Terms of Service</a>
        <a href="#" className="hover:text-primary transition">Contact</a>
      </div>

      {/* RIGHT — COPYRIGHT */}
      <div className="whitespace-nowrap text-right">
        © 2024 VisionGuard Inc. All rights reserved.
      </div>

    </div>

  </div>
</footer>


    </div>
  );
}
