web: gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers 2 --access-logfile -
worker0: WA_WORKER_ID=0 WA_ADMIN_ID=1 WA_SESSION_INDEX=0 celery -A core worker -l info --pool=solo -Q celery,wa-worker-0 -n wa-worker-0@%h --max-tasks-per-child=50
worker1: WA_WORKER_ID=1 WA_ADMIN_ID=1 WA_SESSION_INDEX=1 celery -A core worker -l info --pool=solo -Q wa-worker-1 -n wa-worker-1@%h --max-tasks-per-child=50
worker2: WA_WORKER_ID=2 WA_ADMIN_ID=1 WA_SESSION_INDEX=2 celery -A core worker -l info --pool=solo -Q wa-worker-2 -n wa-worker-2@%h --max-tasks-per-child=50
worker3: WA_WORKER_ID=3 WA_ADMIN_ID=1 WA_SESSION_INDEX=3 celery -A core worker -l info --pool=solo -Q wa-worker-3 -n wa-worker-3@%h --max-tasks-per-child=50
worker4: WA_WORKER_ID=4 WA_ADMIN_ID=2 WA_SESSION_INDEX=0 celery -A core worker -l info --pool=solo -Q wa-worker-4 -n wa-worker-4@%h --max-tasks-per-child=50
worker5: WA_WORKER_ID=5 WA_ADMIN_ID=2 WA_SESSION_INDEX=1 celery -A core worker -l info --pool=solo -Q wa-worker-5 -n wa-worker-5@%h --max-tasks-per-child=50
worker6: WA_WORKER_ID=6 WA_ADMIN_ID=2 WA_SESSION_INDEX=2 celery -A core worker -l info --pool=solo -Q wa-worker-6 -n wa-worker-6@%h --max-tasks-per-child=50
beat: celery -A core beat -l info
