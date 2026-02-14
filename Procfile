django: python manage.py runserver 0.0.0.0:8000
worker: celery -A core worker -l info --concurrency=1
beat: celery -A core beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
