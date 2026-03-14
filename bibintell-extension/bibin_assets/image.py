import base64
import io

import requests
from PIL import Image


def encode_image_to_base64(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")

def query(payload):
    headers = {
        "Accept" : "image/png",
        "Content-Type": "application/json"
    }
    response = requests.post(
        "https://jjx1c75qu4j1zt5s.us-east-1.aws.endpoints.huggingface.cloud",
        headers=headers,
        json=payload
    )
    return response.content


def build_payload(prompt, image_path=None, parameters=None):
    params = parameters or {}

    if image_path:
        # For image-to-image style endpoints, send source image + text prompt.
        return {
            "inputs": encode_image_to_base64(image_path),
            "parameters": {
                "prompt": prompt,
                **params
            }
        }

    # Fallback to text-only generation.
    return {
        "inputs": prompt,
        "parameters": params
    }


payload = build_payload(
    prompt="""- You are an animation assistant. Create image with 4 keyframes for the animation of the cute watercolor-style cartoon beaver wearing a light blue work jumpsuit and a blue cap with the letter “B” stands on a small patch of grassy ground with reeds and plants. 
- output a square image  
- make sure that all frames fit into the image
- Each frame should look like a keyframe from an animation.

- The beaver suddenly jumps up from behind the small grass patch, briefly appearing in the air, then lands gently on the ground and stands still facing forward with a friendly expression.
follow this sequence:
        frame 1: Only the grassy environment with reeds and plants. The beaver is not visible yet
        frame 2: The beaver suddenly jumps up into the air from behind the grass patch. The beaver is mid-air with a surprised but cheerful expression.
        frame 3: The beaver lands gently on the grassy ground, slightly bent knees to show impact.
        frame 4: beaver returns to the position in image
""",
    image_path="frontend/bibin_assets/Bibin_BGRemoved.png",  # Set to None if you only want text-to-image.
    parameters={}
)

output = query(payload)
print(output)
# You can access the image with PIL.Image for example.
image = Image.open(io.BytesIO(output))