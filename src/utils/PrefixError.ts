/**
 * Configuration object for creating a custom error class with prefixes and suffixes.
 */
interface PrefixErrorConfig {
  /** The name of the error class */
  name: string;
  /** Text to prepend to error messages */
  prefix: string;
  /** Optional text to append to error messages */
  suffix?: string;
}

/**
 * A utility class for creating custom Error classes with prefixed and suffixed messages.
 * This allows for consistent error messaging across the application.
 * 
 * @example
 * ```typescript
 * const MyError = new PrefixError({
 *   name: "MyError",
 *   prefix: "[MyModule] ",
 *   suffix: " Please check the documentation."
 * }).Create();
 * 
 * throw new MyError("Something went wrong");
 * // Error: [MyModule] Something went wrong Please check the documentation.
 * ```
 */
export default class PrefixError {
  private name: string;
  private prefix: string;
  private suffix?: string;

  /**
   * Creates a new PrefixError instance.
   * @param config - Configuration object for the error class
   */
  constructor(config: PrefixErrorConfig) {
    this.name = config.name;
    this.prefix = config.prefix;
    this.suffix = config.suffix;
  }

  /**
   * Creates and returns a custom Error class with the configured prefix and suffix.
   * @returns A class that extends Error with the configured naming and message formatting
   */
  public Create() {
    const name = this.name;
    const prefix = this.prefix;
    const suffix = this.suffix;

    return class extends Error {
      /**
       * Creates a new error instance with a prefixed and optionally suffixed message.
       * @param message - The error message
       */
      constructor(message: string) {
        super(`${prefix}${message}${suffix ? ` ${suffix}` : ""}`);
        this.name = name;
      }
    };
  }
}
