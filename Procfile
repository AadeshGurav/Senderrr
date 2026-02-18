web: gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers 2 --access-logfile -
worker0: WA_WORKER_ID=0 celery -A core worker -l info --pool=solo -Q celery,wa-worker-0 -n wa-worker-0@%h --max-tasks-per-child=50
worker1: WA_WORKER_ID=1 celery -A core worker -l info --pool=solo -Q wa-worker-1 -n wa-worker-1@%h --max-tasks-per-child=50
beat: celery -A core beat -l info
