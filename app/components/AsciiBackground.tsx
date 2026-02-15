import { useCallback, useEffect, useRef, useState } from "react";

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => clearTimeout(handler);
    }, [value, delay]);

    return debouncedValue;
}

export function AsciiBackground({ positions }: { positions: { x: number; y: number }[] }) {

    const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const debouncedPositions = useDebounce(positions, 5);

    useEffect(() => {
        const handleResize = () => setWindowSize({ width: document.body.clientWidth, height: document.body.clientHeight });
        window.addEventListener('resize', handleResize);
        handleResize(); // Initialize window size on mount
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const getClosestCursorDistance = useCallback((x: number, y: number) => {
        let closest = null;
        let closestDist = Infinity;

        debouncedPositions.forEach(pos => {
            // Scale normalized positions (0-1) to canvas pixel coordinates
            const scaledX = pos.x * windowSize.width;
            const scaledY = pos.y * windowSize.height;
            const dist = Math.hypot(scaledX - x, scaledY - y);
            if (dist < closestDist) {
                closestDist = dist;
                closest = pos;
            }
        });

        return closestDist;
    }, [debouncedPositions, windowSize]);


    // Redraw the background whenever positions or window size changes

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;



        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '12px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';

        const charWidth = 16; // Approximate width of a character
        const charHeight = 32; // Approximate height of a character

        for (let y = 0; y < canvas.height; y += charHeight) {
            for (let x = 0; x < canvas.width; x += charWidth) {
                const closestDist = getClosestCursorDistance(x, y); // distance to center

                // parabolic font size based on distance, with a max size of 24px and min size of 8px
                const size = Math.max(8, 24 - closestDist / 15);
                // console.log(`Drawing char at (${x}, ${y}) with size ${size} and closest distance ${closestDist}`);
                ctx.font = `${size}px monospace`;
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(Math.max(0.1, 1 - closestDist / 300), 0.5)})`;

                const charCode = closestDist % 94 + 33; // Random ASCII character
                ctx.fillText(String.fromCharCode(charCode), x, y);
            }
        }

    }, [debouncedPositions, windowSize, getClosestCursorDistance]);

    return (
        <div className="absolute top-0 inset-0 pointer-events-none w-full h-full overflow-hidden">
            <canvas
                width={windowSize.width}
                height={windowSize.height}
                className="w-full h-full block"
                ref={canvasRef}
            />

            {/* User Positions */}

        </div>
    );
}