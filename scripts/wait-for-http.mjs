const [url, timeoutValue = "60000"] = process.argv.slice(2);
if (!url) throw new Error("URL required");
const deadline = Date.now() + Number(timeoutValue);
let last;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      console.log(`${url} is ready`);
      ready = true;
      break;
    }
    last = new Error(`HTTP ${response.status}`);
  } catch (error) {
    last = error;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!ready) throw last ?? new Error(`Timed out waiting for ${url}`);
