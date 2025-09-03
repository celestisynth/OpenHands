import asyncio
import os

from openhands.core.config import AppConfig, LLMConfig
from openhands.llm import LLM

async def main():
    """
    This script demonstrates how to use the new models with OpenHands.
    """

    # Load the configuration from the config.toml file
    config = AppConfig.from_toml("config.toml")

    # Get the LLM configurations for the new models
    deepseek_config = config.llm.configs["DeepSeekR1-70B"]
    qwen_config = config.llm.configs["Qwen-Qwen3-Coder-30B-A3B-Instruct"]

    # Create LLM instances for the new models
    deepseek_llm = LLM(deepseek_config)
    qwen_llm = LLM(qwen_config)

    # Example prompt
    prompt = "Hello, who are you?"

    # Send the prompt to the DeepSeek model
    print("Querying DeepSeek model...")
    deepseek_response = await deepseek_llm.completion(
        messages=[{"role": "user", "content": prompt}]
    )
    print(f"DeepSeek response: {deepseek_response.choices[0].message.content}")

    # Send the prompt to the Qwen model
    print("\nQuerying Qwen model...")
    qwen_response = await qwen_llm.completion(
        messages=[{"role": "user", "content": prompt}]
    )
    print(f"Qwen response: {qwen_response.choices[0].message.content}")

if __name__ == "__main__":
    asyncio.run(main())
