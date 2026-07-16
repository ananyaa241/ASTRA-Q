import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

router = APIRouter()

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

@router.post("/", response_model=ChatResponse)
async def chat_with_groq(req: ChatRequest):
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        return ChatResponse(reply="GROQ_API_KEY environment variable is not configured. Please add it to your .env file to enable the cybersecurity assistant.")
    
    headers = {
        "Authorization": f"Bearer {groq_api_key}",
        "Content-Type": "application/json"
    }

    system_prompt = (
        "You are a cybersecurity expert assistant for the ASTRA-Q SOC admin dashboard. "
        "Your role is to help the admin clear any doubts related to cybersecurity, threat vectors, "
        "and behavioral patterns of spammers, hackers, and insider threats. "
        "Provide concise, professional, and actionable advice."
    )

    payload = {
        "model": "llama3-8b-8192",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.message}
        ],
        "temperature": 0.5
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=30.0)
            if response.status_code == 200:
                data = response.json()
                reply = data["choices"][0]["message"]["content"]
                return ChatResponse(reply=reply)
            else:
                return ChatResponse(reply=f"Error connecting to AI: {response.text}")
    except Exception as e:
        return ChatResponse(reply=f"Exception processing request: {str(e)}")
