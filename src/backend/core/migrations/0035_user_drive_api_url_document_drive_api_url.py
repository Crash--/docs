from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0034_remove_invitation_document_remove_invitation_issuer_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="document",
            name="drive_api_url",
            field=models.CharField(
                blank=True, default="", max_length=255, verbose_name="Drive API url"
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="drive_api_url",
            field=models.CharField(
                blank=True, default="", max_length=255, verbose_name="Drive API url"
            ),
        ),
    ]
