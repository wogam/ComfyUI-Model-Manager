import asyncio
import threading
import queue

from . import utils


class DownloadThreadPool:
    def __init__(self) -> None:
        self.workers_count = 0
        self.task_queue = queue.Queue()
        self.running_tasks = set()
        self._lock = threading.Lock()

        default_max_workers = 5
        max_workers: int = default_max_workers
        self.max_worker = max_workers

    def submit(self, task, task_id):
        with self._lock:
            if task_id in self.running_tasks:
                return "Existing"
            self.running_tasks.add(task_id)
            self.task_queue.put((task, task_id))
            if self.workers_count < self.max_worker:
                self.workers_count += 1
                t = threading.Thread(target=self._worker, daemon=True)
                t.start()
                return "Running"
            else:
                return "Waiting"

    def _worker(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            while True:
                try:
                    task, task_id = self.task_queue.get_nowait()
                except queue.Empty:
                    break

                try:
                    loop.run_until_complete(task(task_id))
                except Exception as e:
                    utils.print_error(f"worker run error: {str(e)}")
                finally:
                    with self._lock:
                        self.running_tasks.discard(task_id)
        finally:
            try:
                loop.close()
            except Exception:
                pass
            with self._lock:
                self.workers_count -= 1
