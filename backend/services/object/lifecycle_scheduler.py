"""
Runs the lifecycle engine periodically in the background.
"""

import threading
import time

from core.logger import logger
from services.object.lifecycle_engine import run_lifecycle_engine


CHECK_INTERVAL = 10


def scheduler_loop():
    logger.info("Lifecycle scheduler started.")

    while True:
        try:
            logger.info("Running lifecycle engine...")
            result = run_lifecycle_engine()
            logger.info(result)

            if result["count"] > 0:
                logger.info(
                    f"Lifecycle deleted {result['count']} object(s)."
                )

        except Exception:
            logger.exception("Lifecycle scheduler failed.")

        time.sleep(CHECK_INTERVAL)


def start_scheduler():
    thread = threading.Thread(
        target=scheduler_loop,
        daemon=True
    )

    thread.start()

    return thread
