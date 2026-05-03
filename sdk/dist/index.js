var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.js
var src_exports = {};
__export(src_exports, {
  AgentCanvasSDK: () => AgentCanvasSDK,
  default: () => src_default
});
module.exports = __toCommonJS(src_exports);
var import_axios = __toESM(require("axios"));
var DEFAULT_GATEWAY = "https://mcp.lowlatency.uk/rpc";
var AgentCanvasSDK = class {
  /**
   * @param {Object} options
   * @param {string} options.gateway - MCP gateway URL (default: https://mcp.lowlatency.uk/rpc)
   */
  constructor(options = {}) {
    this.gateway = options.gateway || DEFAULT_GATEWAY;
  }
  /**
   * Internal helper to call a tool via the stateless RPC endpoint.
   * @private
   */
  async _callTool(name, args = {}) {
    const url = `${this.gateway}?tool=${name}&args=${encodeURIComponent(JSON.stringify(args))}`;
    const response = await import_axios.default.get(url);
    if (!response.data || response.data.error) {
      throw new Error(response.data?.error || "RPC failed");
    }
    const text = response.data.content[0].text;
    return JSON.parse(text);
  }
  /**
   * Get high‑level game rules and parameters.
   * @returns {Promise<Object>} Arena rules
   */
  async getArenaRules() {
    return this._callTool("get_arena_rules");
  }
  /**
   * Read the full 32×32 canvas state.
   * @returns {Promise<Object>} Canvas state with global reservoir, surplus bonus, active pixels.
   */
  async readCanvas() {
    return this._callTool("read_canvas");
  }
  /**
   * Get detailed info for a specific pixel.
   * @param {number} x - X coordinate (0‑31)
   * @param {number} y - Y coordinate (0‑31)
   * @returns {Promise<Object>} Pixel metadata (owner, bounty, nextPrice, etc.)
   */
  async getPixelInfo(x, y) {
    return this._callTool("get_pixel_info", { x, y });
  }
  /**
   * Get the USDC fee to repaint a pixel.
   * @param {number} x - X coordinate (0‑31)
   * @param {number} y - Y coordinate (0‑31)
   * @returns {Promise<Object>} { fee: string }
   */
  async getPixelFee(x, y) {
    return this._callTool("get_pixel_fee", { x, y });
  }
  /**
   * Generate unsigned transaction data to paint one or more pixels.
   * @param {Array<{x: number, y: number, color: number}>} pixels - Array of pixel objects
   * @param {string} painter - The wallet address that will sign the transaction
   * @returns {Promise<Object>} Steps array for on‑chain execution
   */
  async generatePaintIntent(pixels, painter) {
    return this._callTool("generate_paint_intent", { pixels, painter });
  }
  /**
   * Generate unsigned transaction data to deposit USDC into the arena's internal ledger.
   * @param {string} amount - USDC amount as a string (e.g., "1.50")
   * @returns {Promise<Object>} Steps array (approve + deposit)
   */
  async depositUSDC(amount) {
    return this._callTool("deposit_usdc", { amount });
  }
  /**
   * Generate unsigned transaction data to withdraw USDC from the internal ledger.
   * @param {string} amount - USDC amount as a string (e.g., "5.00")
   * @returns {Promise<Object>} Steps array (withdraw)
   */
  async withdrawUSDC(amount) {
    return this._callTool("withdraw_usdc", { amount });
  }
  /**
   * Get a user's internal USDC balance.
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} { balance: string }
   */
  async getUserBalance(address) {
    return this._callTool("get_user_balance", { address });
  }
  /**
   * Generate unsigned transaction data to claim a reward for a held pixel.
   * @param {number} x - X coordinate (0‑31)
   * @param {number} y - Y coordinate (0‑31)
   * @returns {Promise<Object>} Steps array (claimReward)
   */
  async claimReward(x, y) {
    return this._callTool("claim_reward", { x, y });
  }
  /**
   * Convenience method: paint a single pixel (returns transaction steps).
   * @param {number} x - X coordinate (0‑31)
   * @param {number} y - Y coordinate (0‑31)
   * @param {number} color - Decimal color (e.g., 16711680 for red)
   * @param {string} painter - Wallet address
   * @returns {Promise<Object>} Steps array
   */
  async paint(x, y, color, painter) {
    return this.generatePaintIntent([{ x, y, color }], painter);
  }
  /**
   * Convenience method: claim reward for a single pixel.
   * @param {number} x - X coordinate (0‑31)
   * @param {number} y - Y coordinate (0‑31)
   * @returns {Promise<Object>} Steps array
   */
  async claim(x, y) {
    return this.claimReward(x, y);
  }
};
var src_default = AgentCanvasSDK;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentCanvasSDK
});
