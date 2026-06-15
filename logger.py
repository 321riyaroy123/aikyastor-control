"""
logging.py - Centralized logging configuration
Provides structured logging for all modules
"""

import logging
from logging.handlers import RotatingFileHandler
import os
from config import LOG_LEVEL, LOG_FORMAT

def setup_logging(app_name: str = "AiKyaStor") -> logging.Logger:
    """
    Configure and return a logger instance
    
    Args:
        app_name: Name for the logger
        
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(app_name)
    logger.setLevel(getattr(logging, LOG_LEVEL))

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(getattr(logging, LOG_LEVEL))
    
    # Formatter
    if LOG_FORMAT == "standard":
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    else:
        formatter = logging.Formatter('%(message)s')
    
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # File handler (if logs directory exists)
    logs_dir = "logs"
    if not os.path.exists(logs_dir):
        os.makedirs(logs_dir, exist_ok=True)
    
    file_handler = RotatingFileHandler(
        f"{logs_dir}/aikya-stor.log",
        maxBytes=10_000_000,  # 10MB
        backupCount=5
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger

logger = setup_logging()
