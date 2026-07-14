"""
routes/simulation_routes.py - Simulation Time Control Blueprint

Moved from: app.py
    - POST /api/simulation/time
    - GET  /api/simulation/time

Responsibility:
    Thin HTTP layer for advancing the mock simulation clock and reading
    it back. Delegates entirely to simulation.simulation, which owns
    SIMULATION_TIME and the lifecycle engine that runs when time advances.
    This blueprint has no production-mode branch, matching the original
    app.py (these endpoints are simulation-only by design).
"""

from flask import Blueprint, request, jsonify
import config.config as config
import simulation.simulation as simulation

simulation_bp = Blueprint("simulation", __name__, url_prefix="/api/simulation")


@simulation_bp.route("/time", methods=["POST"])
def advance_time():
    if config.IS_SIMULATION:
        data = request.get_json() or {}

        return jsonify(
            simulation.advance_simulation_time(
                hours=data.get("advance_hours", 0),
                days=data.get("advance_days", 0)
            )
        )


@simulation_bp.route("/time", methods=["GET"])
def get_simulation_time():
    return jsonify({
        "simulation_time": simulation.get_simulation_time().isoformat() + "Z"
    })