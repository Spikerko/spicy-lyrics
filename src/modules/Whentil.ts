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
    repeater: number = 1,
    /** Give up waiting after this long. Unset waits forever. */
    timeoutMs?: number
): CancelableTask {
    let isCancelled = false;
    // deno-lint-ignore no-unused-vars
    let hasReset = false;
    let executionsRemaining = repeater;
    let deadline = timeoutMs === undefined ? Infinity : performance.now() + timeoutMs;

    const resolveStatement = (): T => (typeof statement === 'function' ? (statement as () => T)() : statement);

    const runner = () => {
        if (isCancelled || executionsRemaining <= 0) return;
        if (performance.now() > deadline) return;

        let conditionMet: T;
        try {
            conditionMet = resolveStatement();
        // deno-lint-ignore no-unused-vars
        } catch (error) {
            // The thing being waited on isn't there yet — keep polling.
            setTimeout(runner, 0);
            return;
        }

        if (!conditionMet) {
            setTimeout(runner, 0);
            return;
        }

        // The run counts even when the callback throws: retrying it would call
        // it again on every tick, forever.
        executionsRemaining--;
        try {
            callback(conditionMet);
        } catch (error) {
            console.error("[Whentil] callback threw", error);
        }
        if (executionsRemaining > 0) setTimeout(runner, 0);
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
                deadline = timeoutMs === undefined ? Infinity : performance.now() + timeoutMs;
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