"""
bucket_settings.py

Persistent storage for bucket-specific settings.
"""

import json
import os

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "bucket_settings.json")

def _ensure_file():
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)

    if not os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "w") as f:
            json.dump({}, f, indent=4)


def load_settings():
    _ensure_file()
    with open(SETTINGS_FILE, "r") as f:
        return json.load(f)

def save_settings(settings):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=4)

def get_bucket_settings(bucket):
    settings = load_settings()

    return settings.get(
        bucket,
        {
            "lifecycle": "none"
        }
    )

def get_all_bucket_settings():
    return load_settings()

def get_bucket_lifecycle(bucket):
    return get_bucket_settings(bucket)["lifecycle"]

def set_bucket_lifecycle(bucket, lifecycle):
    settings = load_settings()

    if bucket not in settings:
        settings[bucket] = {}

    settings[bucket]["lifecycle"] = lifecycle
    save_settings(settings)


def initialize_bucket(bucket, lifecycle="none"):
    settings = load_settings()

    if bucket not in settings:
        settings[bucket] = {
            "lifecycle": lifecycle
        }

        save_settings(settings)


def delete_bucket_settings(bucket):
    settings = load_settings()
    settings.pop(bucket, None)
    save_settings(settings)