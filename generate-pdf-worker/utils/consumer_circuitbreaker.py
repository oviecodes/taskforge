import time
import traceback
from .logger import log
logger = log(service="generate-pdf")

class ConsumerCircuitBreaker:
    def __init__(self):
        self.failureCount = 0
        self.state = "CLOSED"
        self.threshold = 5

    def execute(self, toExecute):
        if self.state == "OPEN":
            logger.info("Circuit OPEN - Can't process requests currently")
            return
        
        try:
            result = toExecute()
            self.onSuccess()
            return result
        except Exception as e:
            tb = traceback.format_exc()
            logger.error("function execution failed \n {error} \n {traceback}", error=str(e), traceback=tb)
            self.onFailure()
            raise
            

    def onSuccess(self):
        self.failureCount = 0
        self.state = "CLOSED"
        pass

    def onFailure(self):
        self.failureCount+=1

        if self.failureCount >= self.threshold:
            self.state = "OPEN"
            time.sleep(60)
            self.state = "CLOSED"


    def getState(self):
        return { 
                "state": self.state, 
                "failureCount": self.failureCount, 
                "threshold": self.threshold 
                }
    
circuitbreaker = ConsumerCircuitBreaker()