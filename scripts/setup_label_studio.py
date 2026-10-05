import os
import sys
import json
import urllib.request
import urllib.parse
from pathlib import Path

LABEL_STUDIO_URL = os.getenv("LABEL_STUDIO_URL", "http://localhost:8085")
REFRESH_TOKEN = os.getenv(
    "LABEL_STUDIO_REFRESH_TOKEN",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6ODA5ODQwNzY2OCwiaWF0IjoxNzkxMjA3NjY4LCJqdGkiOiJiZmFhY2M3ZjY3Zjc0OWVlOTRkNzI1OGRlNThhYzNhNyIsInVzZXJfaWQiOiIxIn0.ugSEf5ihVeP2R3-66enxOgp4xiOZHJ7p9pNAXLkgNX4"
)
API_KEY = os.getenv("LABEL_STUDIO_API_KEY", "622ed18f589798a243b037045ee9296eeb67a17f")

def get_auth_headers():
    if REFRESH_TOKEN:
        try:
            req = urllib.request.Request(
                f"{LABEL_STUDIO_URL}/api/token/refresh/",
                data=json.dumps({"refresh": REFRESH_TOKEN}).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req) as resp:
                access = json.loads(resp.read().decode("utf-8")).get("access")
                if access:
                    return {"Authorization": f"Bearer {access}"}
        except Exception as e:
            print(f"[Notice] Refresh token exchange failed ({e}), falling back to API Key")
    prefix = "Bearer" if API_KEY.startswith("eyJ") else "Token"
    return {"Authorization": f"{prefix} {API_KEY}"}

HEADERS = get_auth_headers()

LABEL_CONFIG = """<View>
  <Image name="image" value="$image"/>
  <RectangleLabels name="objects" toName="image">
    <Label value="Staff Gauge" background="#10b981"/>
    <Label value="Water Obstruction" background="#f59e0b"/>
  </RectangleLabels>
  <KeyPointLabels name="waterline" toName="image">
    <Label value="Water Contact Point" background="#ef4444"/>
  </KeyPointLabels>
  <PolygonLabels name="water_surface" toName="image">
    <Label value="Water Surface" background="#0284c7"/>
  </PolygonLabels>
  <Header value="Quality Assessment (ประเมินคุณภาพภาพ)"/>
  <Choices name="quality_status" toName="image" showInline="true">
    <Choice value="Normal"/>
    <Choice value="Glare / Reflection"/>
    <Choice value="Night / Low Light"/>
    <Choice value="Occluded"/>
  </Choices>
</View>"""


def get_existing_projects():
    req = urllib.request.Request(f"{LABEL_STUDIO_URL}/api/projects", headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("results", [])


def create_project():
    existing = get_existing_projects()
    for p in existing:
        if "Hatyai FloodLens" in p.get("title", ""):
            print(f"Project already exists: ID {p['id']} - {p['title']}")
            return p["id"]

    payload = {
        "title": "Hatyai FloodLens: Staff Gauge & Waterline Annotation",
        "description": "โครงการตรวจทานและกำหนดจุดตัดผิวน้ำ (Ground Truth) สำหรับกล้อง CCTV 3 สถานีหลัก: สะเดา (X.173A), บางศาลา (X.90), หาดใหญ่นอก (X.44)",
        "label_config": LABEL_CONFIG
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{LABEL_STUDIO_URL}/api/projects",
        data=data,
        headers={**HEADERS, "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print(f"Created project: ID {res['id']} - {res['title']}")
        return res["id"]


def upload_image(project_id: int, file_path: str):
    p = Path(file_path)
    if not p.exists():
        print(f"File not found: {file_path}")
        return False

    url = f"{LABEL_STUDIO_URL}/api/projects/{project_id}/import"
    
    # Read binary file
    with open(p, "rb") as f:
        file_bytes = f.read()

    # Multipart form upload
    boundary = "----WebKitFormBoundaryFloodLens7MA4YWxkTrZu0gW"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{p.name}"\r\n'
        f"Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={
            **HEADERS,
            "Content-Type": f"multipart/form-data; boundary={boundary}"
        }
    )

    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Successfully uploaded: {p.name} (Status {resp.status})")
            return True
    except Exception as e:
        print(f"Failed to upload {p.name}: {e}")
        return False


def main():
    print(f"Connecting to Label Studio at {LABEL_STUDIO_URL}...")
    project_id = create_project()

    # Images to import
    base_dir = Path(__file__).resolve().parent.parent
    sample_images_dir = base_dir / "workers" / "vision" / "sample_images"

    images_to_upload = [
        sample_images_dir / "station1_muangkong.jpg",
        sample_images_dir / "station2_bangsala_sample.jpg",
        sample_images_dir / "station3_hatyainai_daytime.jpg",
        sample_images_dir / "station3_hatyainai_dusk.jpg",
        sample_images_dir / "station3_hatyainai_flood.png",
    ]

    print("\nImporting sample CCTV images of all 3 stations...")
    for img_path in images_to_upload:
        if img_path.exists():
            upload_image(project_id, str(img_path))

    print(f"\nSetup complete! You can now view the project and images at {LABEL_STUDIO_URL}")


if __name__ == "__main__":
    main()
