import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any
import websockets
import json
import asyncio
from fastapi.responses import StreamingResponse
import time

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    stream: bool = False

async def stream_agent_responses(request: ChatCompletionRequest):
    user_message = ""
    for message in request.messages:
        if message.role == "user":
            user_message = message.content
            break

    print(f"User message: {user_message}")

    conversation_id = "test-conversation"
    uri = f"ws://localhost:3000/ws?conversation_id={conversation_id}"

    try:
        async with websockets.connect(uri) as websocket:
            message_action = {
                "action": "MessageAction",
                "args": {
                    "content": user_message,
                    "source": "user",
                },
            }

            await websocket.send(json.dumps({"action": "oh_user_action", "data": message_action}))

            while True:
                try:
                    message_str = await asyncio.wait_for(websocket.recv(), timeout=20.0)
                    message = json.loads(message_str)

                    content_chunk = ""
                    if "observation" in message and message["observation"] == "AgentThinkObservation":
                        content_chunk = message["content"]
                    elif "action" in message and message["action"] == "CmdRunAction":
                        content_chunk = f"\n\nRunning command:\n```bash\n{message['args']['command']}\n```\n\n"

                    if content_chunk:
                        chunk = {
                            "id": "chatcmpl-123",
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": request.model,
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {"content": content_chunk},
                                    "finish_reason": None,
                                }
                            ],
                        }
                        yield f"data: {json.dumps(chunk)}\n\n"

                except asyncio.TimeoutError:
                    print("Timeout waiting for agent response.")
                    break
                except websockets.exceptions.ConnectionClosed:
                    print("Connection closed by server.")
                    break
    except Exception as e:
        print(f"Error connecting to WebSocket: {e}")

    # Send the final done chunk
    done_chunk = {
        "id": "chatcmpl-123",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": request.model,
        "choices": [
            {
                "index": 0,
                "delta": {},
                "finish_reason": "stop",
            }
        ],
    }
    yield f"data: {json.dumps(done_chunk)}\n\n"


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    if request.stream:
        return StreamingResponse(stream_agent_responses(request), media_type="text/event-stream")
    else:
        # A non-streaming implementation would go here
        # For now, we will just focus on the streaming case
        return {"error": "Non-streaming not implemented yet"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
