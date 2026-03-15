from bibin_model import BibinModel


def main() -> None:
	model = BibinModel()
	history = []

	print("Bibin interactive test")
	print("Type 'exit' or 'quit' to stop.\n")

	while True:
		try:
			user_message = input("You: ").strip()
		except (KeyboardInterrupt, EOFError):
			print("\nExiting.")
			break

		if not user_message:
			continue

		if user_message.lower() in {"exit", "quit"}:
			print("Exiting.")
			break

		try:
			reply = model.chat(user_message, history)
		except Exception as exc:
			print(f"Bibin error: {exc}")
			continue

		print(f"Bibin: {reply}\n")

		history.append({"role": "user", "content": user_message})
		history.append({"role": "bibin", "content": reply})


if __name__ == "__main__":
	main()
