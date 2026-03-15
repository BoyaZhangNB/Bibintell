import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = "test"
OPENAI_BASE_URL = "https://vjioo4r1vyvcozuj.us-east-2.aws.endpoints.huggingface.cloud/v1"

EMBEDDING_MODEL= "all-MiniLM-L6-v2"

SIMILARITY_HIGH = 0.8 #change later
SIMILARITY_LOW= 0.25 #change later

MAX_PAGE_CHARS = 1000 #change later
PAGE_HISTORY_SIZE = 5 #change later