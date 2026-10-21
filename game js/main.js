import sdk from "@playabl/sdk";
import assetsManifest from "./assets.json";
import assetsValues from "./assets.values.json";
import { createDevtools } from "./game/devtools.js";
import { createGame } from "./game/game.js";
import tweaksManifest from "./tweaks.json";
import tweaksValues from "./tweaks.values.json";
import "./styles.css";

const app = document.querySelector("#app");
const ready = await sdk.ready();

// The two `.values.json` files are the Creator's: they hold what a creator saved
// in the Creator Tools and win over the defaults in tweaks.json / assets.json.
// Game code and the agent only read them; the SDK does the merge.
const tweaks = await sdk.tweaks.init(tweaksManifest, { values: tweaksValues });
// Save in the Creator Tools writes the values the game is already running (the
// host pushes each edit live), so a write to the file must not reload the game.
if (import.meta.hot) import.meta.hot.accept("./tweaks.values.json");
const assets =
  Object.keys(assetsManifest).length > 0
    ? await sdk.assets.register(assetsManifest, { values: assetsValues })
    : undefined;

// Progress from the last session; a missing or failed load starts fresh.
let saved = null;
try {
  saved = await sdk.gameState.load();
} catch {
  saved = null;
}

// Keep bootstrap boring; build the actual game in src/game/game.js.
const game = createGame({ mount: app, sdk, ready, tweaks, assets, saved });

// The SDK owns the clock. Freeze, step, time scale and restart are properties
// of this loop, so game code never keeps a timer or reads a wall clock — time
// arrives as `dt` in update().
const run = await sdk.game.run(game.hooks, { state: game.state });
game.setRun(run);

// Creator Tools vocabulary: what the editor can inspect and drive. Inert
// outside the Playabl host. Guarded on its own: a mistake in devtools.js
// costs the editor, never the game.
try {
  await sdk.devtools.init(createDevtools({ mount: app, game, run }));
} catch (error) {
  console.warn("[playabl] Creator Tools did not start; the game runs without them.", error);
}
