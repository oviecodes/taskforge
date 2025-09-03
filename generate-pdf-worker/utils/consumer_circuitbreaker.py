import time
import traceback
from .logger import log
logger = log(service="generate-pdf")

class ConsumerCircuitBreaker:
    def __init__(self):
        self.failureCount = 0
        self.state = "CLOSED"
        self.threshold = 5
        self.lastFailureTime = 0
        self.timeout = 60

    def execute(self, toExecute):
        if self.state == "OPEN":
            if time.time() - self.lastFailureTime > self.timeout:
                self.state = "HALF_OPEN"
                logger.info("Circuit state has been set to HALF_OPEN")
            else:
                logger.info("Circuit OPEN - Can't process requests currently")
                raise
        
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
        self.lastFailureTime = time.time()

        if self.failureCount >= self.threshold:
            self.state = "OPEN"


    def getState(self):
        return { 
                "state": self.state, 
                "failureCount": self.failureCount, 
                "threshold": self.threshold,
                "timeSinceLastFailure": time.time() - self.lastFailureTime if self.lastFailureTime > 0 else 0
                }
    
    def getTimeSinceLastFailure(self):
        return time.time() - self.lastFailureTime if self.lastFailureTime > 0 else 0
    
circuitbreaker = ConsumerCircuitBreaker()