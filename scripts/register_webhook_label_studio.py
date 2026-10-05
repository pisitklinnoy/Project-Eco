from projects.models import Project
from webhooks.models import Webhook, WebhookAction

project = Project.objects.filter(title="Hatyai FloodLens: Staff Gauge").first()
if not project:
    print("Project not found")
    exit(1)

org = project.organization
webhook_url = "http://backend:8000/api/v1/review/webhook/label-studio"

# Check if webhook already exists
webhook = Webhook.objects.filter(project=project, url=webhook_url).first()
if not webhook:
    webhook = Webhook.objects.create(
        organization=org,
        project=project,
        url=webhook_url,
        send_payload=True,
        send_for_all_actions=False,
        is_active=True
    )
    print(f"[Webhook] Created Webhook for Project {project.id}: {webhook_url}")
else:
    webhook.is_active = True
    webhook.send_payload = True
    webhook.save()
    print(f"[Webhook] Existing Webhook updated: {webhook_url}")

# Ensure actions: ANNOTATION_CREATED, ANNOTATION_UPDATED
actions = ["ANNOTATION_CREATED", "ANNOTATION_UPDATED"]
for action_name in actions:
    wa = WebhookAction.objects.filter(webhook=webhook, action=action_name).first()
    if not wa:
        WebhookAction.objects.create(webhook=webhook, action=action_name)
        print(f"[Webhook] Registered Action: {action_name}")

print("\nWebhook configuration successfully registered in Label Studio!")
