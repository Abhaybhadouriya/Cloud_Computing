import grpc
import chat_pb2
import chat_pb2_grpc
import time

def run_client(client_id):
    channel = grpc.insecure_channel('localhost:50051')
    stub = chat_pb2_grpc.ChatServiceStub(channel)

    def request_messages():
        for i in range(5):
            message = f"Hello from Client {client_id}, message {i+1}"
            print(f"Client {client_id} sending: {message}")
            yield chat_pb2.ChatRequest(message=message)
            time.sleep(1)  # simulate delay between messages

    responses = stub.ChatStream(request_messages())
    for response in responses:
        print(f"Client {client_id} received: {response.reply}")


if __name__ == '__main__':
    run_client(client_id=1)  # Will be overridden by multiprocessing
