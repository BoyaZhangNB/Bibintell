from collections import deque
from .config import PAGE_HISTORY_SIZE

# how many historical pages should we analyse to find out if the person
# is drifting away
PAGES_TO_ANALYSE= 3 #change

DRIFTING_THRESHOLD= 0.4 #change

# recent webpages have more distraction/focussing effect
drifting_weights=[0.143, 0.286,0.571] #change

class IntentTracker:
    def __init__(self):
        self.intent_embedding=None
        self.history= deque(maxlen=PAGE_HISTORY_SIZE)

    def set_intent(self,emb):
        self.intent_embedding=emb
        self.history.clear()

    def add_page(self, sim, title, url=None, relevant=None):
        self.history.append({
            "similarity": sim,
            "title": title,
            "url": url,
            "relevant": relevant
        })

    def add_to_history(self, item):
        self.history.append(item)

    def detect_drift(self):
        if len(self.history) < PAGES_TO_ANALYSE:
            return False
        
        recent= list(self.history)[-1*PAGES_TO_ANALYSE:]
        avg= 0
        for i in range(len(recent)):
            avg+=drifting_weights[i]*recent[i]
        

        if avg<DRIFTING_THRESHOLD:
            return True
        return False
    
tracker= IntentTracker()