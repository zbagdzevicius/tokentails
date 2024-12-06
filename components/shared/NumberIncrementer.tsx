import React, { useState, useEffect } from "react";

interface NumberIncrementerProps {
    number: number;
}

export const NumberIncrementer: React.FC<NumberIncrementerProps> = ({ number }) => {
    const [currentValue, setCurrentValue] = useState<number>(0);
    const [iteration, setIteration] = useState<number>(0);

    const totalTime = 4000;
    const period = 100;
    const totalIterations = Math.ceil(totalTime / period);

    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        if (iteration < totalIterations) {
            interval = setInterval(() => {
                setIteration((prev) => prev + 1);
            }, period);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [iteration, totalIterations]);

    useEffect(() => {
        const projectedNumber = (iteration * period) / totalTime * number;

        if (projectedNumber >= number) {
            setCurrentValue(number);
        } else {
            setCurrentValue(projectedNumber);
        }
    }, [iteration, number, period, totalTime]);

    return currentValue
};
