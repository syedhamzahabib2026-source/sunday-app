import os
from slack_bolt.adapter.socket_mode import SocketModeHandler
from app.slack.bot import app  # bot.py loads .env at import time

handler = SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"])

__all__ = ["app", "handler"]
