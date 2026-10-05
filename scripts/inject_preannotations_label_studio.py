import os
import json
from projects.models import Project
from tasks.models import Task, Prediction, Annotation, AnnotationDraft
from users.models import User

user = User.objects.filter(email='admin@example.com').first() or User.objects.first()
project = Project.objects.filter(title="Hatyai FloodLens: Staff Gauge").first()

if not project:
    print("Project not found")
    exit(1)

pre_annotations = {
    1: {
        "station": "Ban Muangkong (X.173A)",
        "score": 0.89,
        "result": [
            {
                "id": "box_muangkong_gauge",
                "type": "rectanglelabels",
                "value": {
                    "x": 56.56,
                    "y": 18.61,
                    "width": 2.2,
                    "height": 37.56,
                    "rotation": 0,
                    "rectanglelabels": ["Staff Gauge"]
                },
                "to_name": "image",
                "from_name": "objects",
                "original_width": 3200,
                "original_height": 1800
            },
            {
                "id": "point_muangkong_water",
                "type": "keypointlabels",
                "value": {
                    "x": 57.5,
                    "y": 48.2,
                    "width": 0.5,
                    "keypointlabels": ["Water Contact Point"]
                },
                "to_name": "image",
                "from_name": "waterline",
                "original_width": 3200,
                "original_height": 1800
            },
            {
                "id": "quality_muangkong",
                "type": "choices",
                "value": {
                    "choices": ["Normal"]
                },
                "to_name": "image",
                "from_name": "quality_status"
            }
        ]
    },
    2: {
        "station": "Bangsala Bridge (X.90)",
        "score": 0.84,
        "result": [
            {
                "id": "box_bangsala_gauge",
                "type": "rectanglelabels",
                "value": {
                    "x": 57.97,
                    "y": 26.67,
                    "width": 2.4,
                    "height": 34.44,
                    "rotation": 0,
                    "rectanglelabels": ["Staff Gauge"]
                },
                "to_name": "image",
                "from_name": "objects",
                "original_width": 3200,
                "original_height": 1800
            },
            {
                "id": "point_bangsala_water",
                "type": "keypointlabels",
                "value": {
                    "x": 58.8,
                    "y": 56.5,
                    "width": 0.5,
                    "keypointlabels": ["Water Contact Point"]
                },
                "to_name": "image",
                "from_name": "waterline",
                "original_width": 3200,
                "original_height": 1800
            },
            {
                "id": "quality_bangsala",
                "type": "choices",
                "value": {
                    "choices": ["Glare / Reflection"]
                },
                "to_name": "image",
                "from_name": "quality_status"
            }
        ]
    },
    3: {
        "station": "Hatyai Nai Bridge (X.44)",
        "score": 0.92,
        "result": [
            {
                "id": "box_hatyainai_gauge",
                "type": "rectanglelabels",
                "value": {
                    "x": 66.8,
                    "y": 12.0,
                    "width": 2.8,
                    "height": 75.0,
                    "rotation": 0,
                    "rectanglelabels": ["Staff Gauge"]
                },
                "to_name": "image",
                "from_name": "objects",
                "original_width": 1920,
                "original_height": 1080
            },
            {
                "id": "point_hatyainai_water",
                "type": "keypointlabels",
                "value": {
                    "x": 68.0,
                    "y": 74.0,
                    "width": 0.5,
                    "keypointlabels": ["Water Contact Point"]
                },
                "to_name": "image",
                "from_name": "waterline",
                "original_width": 1920,
                "original_height": 1080
            },
            {
                "id": "quality_hatyainai",
                "type": "choices",
                "value": {
                    "choices": ["Normal"]
                },
                "to_name": "image",
                "from_name": "quality_status"
            }
        ]
    }
}

for task_id, data in pre_annotations.items():
    try:
        task = Task.objects.get(id=task_id, project=project)
        
        # 1. Clear existing empty predictions and drafts
        Prediction.objects.filter(task=task).delete()
        AnnotationDraft.objects.filter(task=task).delete()
        
        # 2. Create AI Prediction
        pred = Prediction.objects.create(
            task=task,
            project=project,
            result=data["result"],
            score=data["score"],
            model_version="FloodLens-YOLOv8-v1.0"
        )
        print(f"[Success] Created AI Prediction for Task {task_id} ({data['station']})")
        
        # 3. Create or update AnnotationDraft so when user opens the labeling screen,
        # the boxes & points are already drawn and editable!
        AnnotationDraft.objects.create(
            task=task,
            user=user,
            result=data["result"],
            lead_time=12.5
        )
        print(f"[Success] Pre-filled Annotation Draft for Task {task_id}")

    except Task.DoesNotExist:
        print(f"[Skip] Task ID {task_id} not found")

print("\nAll AI Pre-annotations successfully injected into Label Studio!")
