/* Video Grid Styling */
.video-grid {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
}

@media (max-width: 480px) {
    .video-grid {
        grid-template-columns: 1fr;
    }
}

.video-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #000;
    border: 1px solid var(--neon-cyan);
    box-shadow: inset 0 0 10px rgba(0, 243, 255, 0.2);
    overflow: hidden;
}

.video-label {
    position: absolute;
    top: 5px;
    left: 5px;
    font-size: 0.7rem;
    background: rgba(5, 5, 10, 0.8);
    padding: 2px 6px;
    color: var(--neon-cyan);
    border: 1px solid var(--neon-cyan);
    z-index: 2;
}

video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* Mirror local feed so it feels natural */
}

#local-video {
    transform: scaleX(-1);
}

.chat-box {
    height: 200px; /* Reduced height to leave room for videos */
}