# app/utils/safe_delete.py

import os
import logging

def safe_delete(file_path: str):
    try:
        os.remove(file_path)
        logging.info(f"🧹 Deleted file: {file_path}")
    except FileNotFoundError:
        pass
    except Exception as e:
        logging.warning(f"⚠️ Could not delete {file_path}: {e}")
