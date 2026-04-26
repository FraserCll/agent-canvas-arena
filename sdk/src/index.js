import axios from 'axios';

/**
 * Thin SDK for Agent Canvas Arena.
 * Wraps MCP server calls and returns unsigned transaction data.
 * No private‑key handling – signing remains with the user's wallet.
 */

const DEFAULT_GATEWAY = 'https://mcp.lowlatency.uk/rpc';

export class AgentCanvasSDK {
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
    const response = await axios.get(url);
    if (!response.data || response.data.error) {
      throw new Error(response.data?.error || 'RPC failed');
    }
    // MCP response format: { content: [{ type: "text", text: "..." }] }
    const text = response.data.content[0].text;
    return JSON.parse(text);
  }

  /**
   * Get high‑level game rules and parameters.
   * @returns {Promise<Object>} Arena rules
   */
  async getArenaRules() {
    return this._callTool('get_arena_rules');
  }

  /**
   * Read the full 32×32 canvas state.
   * @returns {Promise<Object>} Canvas state with global reservoir, surplus bonus, active pixels.
   */
  async readCanvas() {
    return this._callTool('read_canvas');
  }

  /**
   * Get detailed info for a specific pixel.
   * @param {number} x - X coordinate (0‑31)
   * @param {number} y - Y coordinate (0‑31)
   * @returns {Promise<Object>} Pixel metadata (owner, bounty, nextPrice, etc.)
   */
  async getPixelInfo(x, y) {
    return this._callTool('get_pixel_info', { x, y });
  }

  /**
   * Get the USDC fee to repaint a pixel.
   * @param {number} x - X coordinate (0‑31)
   * @param {number} y - Y coordinate (0‑31)
   * @returns {Promise<Object>} { fee: string }
   */
  async getPixelFee(x, y) {
    return this._callTool('get_pixel_fee', { x, y });
  }

  /**
   * Generate unsigned transaction data to paint one or more pixels.
   * @param {Array<{x: number, y: number, color: number}>} pixels - Array of pixel objects
   * @param {string} painter - The wallet address that will sign the transaction
   * @returns {Promise<Object>} Steps array for on‑chain execution
   */
  async generatePaintIntent(pixels, painter) {
    return this._callTool('generate_paint_intent', { pixels, painter });
  }

  /**
   * Generate unsigned transaction data to deposit USDC into the arena's internal ledger.
   * @param {string} amount - USDC amount as a string (e.g., "1.50")
   * @returns {Promise<Object>} Steps array (approve + deposit)
   */
  async depositUSDC(amount) {
    return this._callTool('deposit_usdc', { amount });
  }

  /**
   * Generate unsigned transaction data to withdraw USDC from the internal ledger.
   * @param {string} amount - USDC amount as a string (e.g., "5.00")
   * @returns {Promise<Object>} Steps array (withdraw)
   */
  async withdrawUSDC(amount) {
    return this._callTool('withdraw_usdc', { amount });
  }

  /**
   * Get a user's internal USDC balance.
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} { balance: string }
   */
  async getUserBalance(address) {
    return this._callTool('get_user_balance', { address });
  }

  /**
   * Generate unsigned transaction data to claim a reward for a held pixel.
   * @param {number} x - X coordinate (0‑31)
   * @param {number} y - Y coordinate (0‑31)
   * @returns {Promise<Object>} Steps array (claimReward)
   */
  async claimReward(x, y) {
    return this._callTool('claim_reward', { x, y });
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
}

// Default export
export default AgentCanvasSDK;