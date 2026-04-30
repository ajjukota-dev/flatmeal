import { loadEnv } from "./config/env.js";
import { createServer } from "./server.js";

const env = loadEnv();
const app = createServer(env);

app.listen(env.PORT, () => {
  console.log(`flatmeal backend listening on ${env.PORT}`);
});
