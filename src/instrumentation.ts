export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnvironment } = await import("./lib/server/env");
    getEnvironment();
  }
}
