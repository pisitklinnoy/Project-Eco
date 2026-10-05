import os
import shutil
from pathlib import Path
from users.models import User
from projects.models import Project
from tasks.models import Task
from data_import.models import FileUpload

user = User.objects.filter(email='admin@example.com').first()
if not user:
    user = User.objects.first()

org = user.active_organization

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

project_title = "Hatyai FloodLens: Staff Gauge"
project = Project.objects.filter(title=project_title).first()

if not project:
    project = Project.objects.create(
        title=project_title,
        description="Ground Truth Waterline Annotation: Muangkong, Bangsala, Hatyainai",
        label_config=LABEL_CONFIG,
        created_by=user,
        organization=org
    )
    print(f"Created Project: ID {project.id} - {project.title}")
else:
    print(f"Found Existing Project: ID {project.id} - {project.title}")

# Create destination upload folder
upload_dir = Path("/label-studio/data/media/upload") / str(project.id)
upload_dir.mkdir(parents=True, exist_ok=True)

# 1. Add Live Camera Streams
live_streams = [
    {
        "station": "Ban Muangkong (X.173A - Sadao)",
        "url": "https://hatyaicityclimate.org/floodphoto/last/muangkong.jpg"
    },
    {
        "station": "Bangsala Bridge (X.90 - Khlong Hoi Khong)",
        "url": "https://hatyaicityclimate.org/floodphoto/last/bangsala.jpg"
    },
    {
        "station": "Hatyai Nai Bridge (X.44 - Hatyai City)",
        "url": "https://hatyaicityclimate.org/floodphoto/last/hatyainai.jpg"
    }
]

for item in live_streams:
    task = Task.objects.filter(project=project, data__image=item["url"]).first()
    if not task:
        task = Task.objects.create(
            project=project,
            data={
                "image": item["url"],
                "station_name": item["station"],
                "source": "CCTV_LIVE_FEED"
            }
        )
        print(f"Added Task: {item['station']}")

# 2. Add local sample images from /sample_images if available
sample_dir = Path("/sample_images")
if sample_dir.exists():
    for f in sample_dir.glob("*.*"):
        if f.suffix.lower() in [".jpg", ".jpeg", ".png"]:
            dest = upload_dir / f.name
            shutil.copy(f, dest)
            media_rel = f"upload/{project.id}/{f.name}"
            media_url = f"/data/upload/{project.id}/{f.name}"
            # Ensure FileUpload object exists in DB so Label Studio API doesn't 500 on permission check
            FileUpload.objects.get_or_create(
                project=project,
                file=media_rel,
                defaults={"user": user}
            )
            task = Task.objects.filter(project=project, data__image=media_url).first()
            if not task:
                Task.objects.create(
                    project=project,
                    data={
                        "image": media_url,
                        "station_name": f.stem,
                        "source": "HISTORICAL_SAMPLE"
                    }
                )
                print(f"Added Local Media Task: {f.name}")

print(f"\nSUCCESS! Total Tasks in Project {project.id}: {Task.objects.filter(project=project).count()}")
