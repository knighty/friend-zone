export function executionTimer(options?: Partial<{
    format: "seconds" | "milliseconds" | "minutes"
}>) {
    const start = performance.now();
    return {
        duration: () => {
            const end = performance.now();
            return Math.floor(end - start);
        },
        end: () => {
            const end = performance.now();
            const duration = Math.floor(end - start);

            switch (options?.format ?? "milliseconds") {
                case "milliseconds":
                    return duration.toLocaleString() + "ms";
                case "seconds":
                    return Math.floor(duration / 1000).toLocaleString() + "s";
                case "minutes":
                    return Math.floor(duration / 60000).toLocaleString() + "m";
            }
        }
    }
}