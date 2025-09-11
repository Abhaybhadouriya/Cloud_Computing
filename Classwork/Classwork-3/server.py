import grpc
from concurrent import futures
import time
import chat_pb2
import chat_pb2_grpc

class ChatService(chat_pb2_grpc.ChatServiceServicer):
    def ChatStream(self, request_iterator, context):
        for chat_request in request_iterator:
            print(f"Received from client: {chat_request.message}")
            reply_msg = f"Server reply to: {chat_request.message}"
            yield chat_pb2.ChatResponse(reply=reply_msg)


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    chat_pb2_grpc.add_ChatServiceServicer_to_server(ChatService(), server)
    server.add_insecure_port('[::]:50051')
    server.start()
    print("Server started on port 50051")
    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)


if __name__ == '__main__':
    serve()
