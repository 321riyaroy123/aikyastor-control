import os
from flask import Flask, jsonify, send_file
from flask_cors import CORS

import config.config as config
from core.logger import logger

from routes.cluster_routes import cluster_bp
from routes.object_routes import object_bp
from routes.block_routes import block_bp
from routes.file_routes import file_bp
from routes.vault_routes import vault_bp
from routes.lifecycle_policy_routes import lifecycle_policy_bp
from routes.simulation_routes import simulation_bp

# ─── Initialize Flask App ─────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

logger.info(f"Starting AiKyaStor CONTROL in {config.get_app_mode()} mode")

# ─── Register Blueprints (URL prefixes match the original app.py exactly) ────
app.register_blueprint(cluster_bp)     # /api/activity, /api/stats, /api/health, /api/version, /api/info
app.register_blueprint(object_bp)      # /api/object/... (incl. bucket ACCESS policy: /api/object/buckets/<bucket>/policy)
app.register_blueprint(block_bp)       # /api/block/...
app.register_blueprint(file_bp)        # /api/file/...
app.register_blueprint(vault_bp)       # /api/vault/status, /api/block/images/<name>/export-vault, /api/file/sync-vault
app.register_blueprint(lifecycle_policy_bp)  # /api/policies..., /api/object/buckets/<bucket>/lifecycle
app.register_blueprint(simulation_bp)  # /api/simulation/time

# ═════════════════════════════════════════════════════════════════════════════
# FRONTEND SERVING
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/", methods=["GET"])
def serve_frontend():
    """Serve frontend"""
    frontend_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'index.html')
    if os.path.exists(frontend_path):
        return send_file(frontend_path)
    return jsonify({"message": "AiKyaStor CONTROL Backend API"}), 200

# ═════════════════════════════════════════════════════════════════════════════
# ERROR HANDLERS
# ═════════════════════════════════════════════════════════════════════════════

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({"error": "Not found"}), 404

@app.errorhandler(500)
def server_error(error):
    """Handle 500 errors"""
    logger.exception("Server error")
    return jsonify({"error": "Internal server error"}), 500

# ═════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    app.run(
        host=config.FLASK_HOST,
        port=config.FLASK_PORT,
        debug=True
    )