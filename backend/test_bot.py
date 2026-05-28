"""Test parse_intent against 6 representative messages."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from app.slack.bot import parse_intent  # noqa: E402

TEST_MESSAGES = [
    # Bug regression test
    "add a task to prep for my meeting, 30 minutes, high priority",
    # Original 6
    "add a task to write my blog post, 45 minutes, high priority",
    "I finished the client proposal",
    "pick up dry cleaning tomorrow at 4, maybe 20 minutes",
    "cancel gym thursday",
    "what does my friday look like",
    "hey I'm running low energy today can you move my hard tasks to tomorrow",
]


def main():
    col_w = [52, 20, 12, 10]
    header = (
        f"{'Message':<{col_w[0]}} {'Intent':<{col_w[1]}} "
        f"{'Confidence':<{col_w[2]}} {'Key data'}"
    )
    sep = "-" * (sum(col_w) + 20)
    print(header)
    print(sep)

    for msg in TEST_MESSAGES:
        result = parse_intent(msg)
        intent = result.get("intent", "ERROR")
        confidence = result.get("confidence", "—")
        data = result.get("data") or {}
        key_data = ", ".join(f"{k}={v}" for k, v in data.items() if v is not None)
        truncated_msg = msg[:col_w[0] - 1] if len(msg) > col_w[0] - 1 else msg
        print(
            f"{truncated_msg:<{col_w[0]}} {intent:<{col_w[1]}} "
            f"{str(confidence):<{col_w[2]}} {key_data}"
        )


if __name__ == "__main__":
    main()
