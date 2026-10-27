"""No test reaches a real server (the first fixture in tests/conftest.py).

The owner has a free model-API credit and no money past it. A test that built
the real client by mistake would spend that credit, so for the whole run a
socket may connect to this machine and to nothing else. The client tests keep
their stub server, which listens on 127.0.0.1.
"""

import socket

import pytest


# Reserved for documentation (RFC 5737): nothing answers there, so if the guard
# failed these tests would time out and not reach anyone.
NOT_HERE = ("192.0.2.1", 443)


def test_a_test_cannot_connect_to_a_server_that_is_not_on_this_machine():
    with pytest.raises(RuntimeError, match="real server"):
        socket.create_connection(NOT_HERE, timeout=1)


def test_connect_ex_is_guarded_too():
    with socket.socket() as sock:
        with pytest.raises(RuntimeError, match="real server"):
            sock.connect_ex(NOT_HERE)


def test_a_test_can_still_connect_to_a_server_on_this_machine():
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        server.listen()

        with socket.create_connection(server.getsockname(), timeout=2) as client:
            accepted, _ = server.accept()
            accepted.close()

            assert client.getpeername() == server.getsockname()


@pytest.mark.parametrize("name", ["example.invalid", "localhost.example.invalid", "127.0.0.1.example.invalid"])
def test_a_host_given_by_name_is_refused_as_it_stands(name):
    # The guard runs before the name is looked up, so a name cannot be shown to be
    # this machine and has to be refused. Only the exact word localhost is let through.
    with socket.socket() as sock:
        with pytest.raises(RuntimeError, match="real server"):
            sock.connect((name, 443))


def test_localhost_by_name_is_this_machine():
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        server.listen()

        with socket.socket() as client:
            client.settimeout(2)
            client.connect(("localhost", server.getsockname()[1]))
