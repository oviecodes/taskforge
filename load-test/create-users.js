import http from "k6/http"
import { SharedArray } from "k6/data"

const users = new SharedArray("all test users", function () {
  return JSON.parse(open("./testUsers.json")).users
})

export const options = {
  duration: "1200s",
}

export default function () {
  for (let i = 0; i < users.length; i++) {
    http.post("https://api-taskforge.oviecodes.xyz/auth/signup", users[i])
  }
}
