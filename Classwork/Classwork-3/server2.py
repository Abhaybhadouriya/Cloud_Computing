import grpc
from concurrent import futures
import time

import chatbot_pb2
import chatbot_pb2_grpc

chat_responses = {
    "Hello": "Hi there!",
    "How are you?": "I'm a bot, but I'm doing fine!",
    "What is your name?": "I'm Naval's ChatBot.",
}


class ChatServicer(chatbot_pb2_grpc.ChatServiceServicer):
    def ChatStream(self, request_iterator, context):
        for request in request_iterator:
            msg = request.message
            if msg == "Bye":
                print("Client said Bye. Closing connection.")
                break
            response_text = chat_responses.get(msg, "Sorry, I did not understand response\n")
            print(f"Received from client: {msg} | Responding with: {response_text}")
            yield chatbot_pb2.ChatbotResponse(reply=response_text)


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    chatbot_pb2_grpc.add_ChatServiceServicer_to_server(ChatServicer(), server)
    server.add_insecure_port('[::]:50051')
    server.start()
    print("Server started on port 50051")
    try:
        while True:
            time.sleep(86400)  # One day
    except KeyboardInterrupt:
        server.stop(0)


if __name__ == '_main_':
    serve()