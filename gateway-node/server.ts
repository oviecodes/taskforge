import app from "./app"
import { config } from "./src/config"
import { connectToRabbitMQ } from "./src/services/rabbitmq.service"

const PORT = config.port

// connectToRabbitMQ()
//   .then(() => app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`)))
//   .catch(console.error)

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`))
