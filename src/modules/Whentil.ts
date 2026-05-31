export type CancelableTask = {
    Cancel: () => void;
    Reset: () => void;
};

function Until<T>(
    statement: T | (() => T),
    callback: () => void,
    maxRepeats: number = Infinity
): CancelableTask {
    let isCancelled = false;
    // deno-lint-ignore no-unused-vars
    let hasReset = false;
    let executedCount = 0;

    const resolveStatement = (): T => (typeof statement === 'function' ? (statement as () => T)() : statement);

    const runner = () => {
        if (isCancelled || executedCount >= maxRepeats) return;

        const conditionMet = resolveStatement();
        if (!conditionMet) {
            callback();
            executedCount++;
            setTimeout(runner, 0);
        }
    };

    setTimeout(runner, 0);

    return {
        Cancel() {
            isCancelled = true;
        },
        Reset() {
            if (executedCount >= maxRepeats || isCancelled) {
                isCancelled = false;
                hasReset = true;
                executedCount = 0;
                runner();
            }
        },
    };
}

function When<T>(
    statement: T | (() => T),
    callback: (statement: T) => void,
    repeater: number = 1
): CancelableTask {
    let isCancelled = false;
    // deno-lint-ignore no-unused-vars
    let hasReset = false;
    let executionsRemaining = repeater;

    const resolveStatement = (): T => (typeof statement === 'function' ? (statement as () => T)() : statement);

    const runner = () => {
        if (isCancelled || executionsRemaining <= 0) return;

        try {
            const conditionMet = resolveStatement();
            if (conditionMet) {
                callback(resolveStatement());
                executionsRemaining--;
                if (executionsRemaining > 0) setTimeout(runner, 0);
            } else {
                setTimeout(runner, 0);
            }
        // deno-lint-ignore no-unused-vars
        } catch (error) {
            setTimeout(runner, 0);
        }
    };

    setTimeout(runner, 0);

    return {
        Cancel() {
            isCancelled = true;
        },
        Reset() {
            if (executionsRemaining <= 0 || isCancelled) {
                isCancelled = false;
                hasReset = true;
                executionsRemaining = repeater;
                runner();
            }
        },
    };
}

const Whentil = {
    When,
    Until,
}

export default Whentil;