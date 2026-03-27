import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import "./BackgroundCarousel.css"; // Import the new CSS

const defaultImages = [
    "/backgrounds/bg-1.jpg",
    "/backgrounds/bg-2.jpg",
    "/backgrounds/bg-3.jpg",
    "/backgrounds/bg-4.jpg",
    "/backgrounds/bg-5.jpg",
    "/backgrounds/bg-6.jpg",
    "/backgrounds/bg-7.jpg",
    "/backgrounds/bg-8.jpg",
];

const loginImages = [
    "/backgrounds/login/login-bg-1.jpg",
    "/backgrounds/login/login-bg-2.jpg",
    "/backgrounds/login/login-bg-3.jpg",
    "/backgrounds/login/login-bg-4.jpg",
    "/backgrounds/login/login-bg-5.jpg",
    "/backgrounds/login/login-bg-6.jpg",
    "/backgrounds/login/login-bg-7.jpg",
];

export default function BackgroundCarousel() {
    const { theme } = useTheme();
    const location = useLocation();
    const isLogin = location.pathname === "/" || location.pathname === "/login";

    const images = isLogin ? loginImages : defaultImages;
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        // Preload images
        images.forEach((src) => {
            const img = new Image();
            img.src = src;
        });

        // Reset index when switching modes (e.g. login -> app)
        setCurrentIndex(0);
    }, [isLogin]);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % images.length);
        }, 8000); // Change every 8 seconds

        return () => clearInterval(interval);
    }, [images.length]);

    const nextImage = () => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
    };

    const prevImage = () => {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    return (
        <div className={`bg-carousel-container ${isLogin ? 'login-mode' : ''}`}>
            {images.map((img, index) => (
                <div
                    key={index}
                    className="bg-carousel-slide"
                    style={{
                        backgroundImage: `url(${img})`,
                        opacity: index === currentIndex ? 1 : 0,
                    }}
                />
            ))}
            <div className={`bg-carousel-overlay ${theme === 'dark' ? 'overlay-dark' : 'overlay-light'}`} />

            {/* Navigation Controls (Only for Login Mode) */}
            {isLogin && (
                <>
                    <button className="carousel-arrow left" onClick={prevImage}>&#10094;</button>
                    <button className="carousel-arrow right" onClick={nextImage}>&#10095;</button>

                    <div className="carousel-dots">
                        {images.map((_, index) => (
                            <span
                                key={index}
                                className={`dot ${index === currentIndex ? "active" : ""}`}
                                onClick={() => setCurrentIndex(index)}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
