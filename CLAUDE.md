# Claude Code Guidelines for This Project

## Library & Ecosystem Awareness

**Before writing custom integration code, always check for official libraries first.**

When working with any protocol, SDK, or library ecosystem:

1. **Check for complementary packages** - If using one part of an ecosystem (e.g., `@x402/express` for server), immediately check if there are official packages for other parts (e.g., `@x402/fetch` for client)

2. **Search npm/package registries** - Run `npm search <ecosystem-name>` or check the library's GitHub org for related packages before implementing custom code

3. **Prefer official over custom** - Official libraries handle edge cases, protocol changes, and compatibility issues. Custom implementations often have subtle bugs (like the EIP-712 BigInt serialization issue we hit)

4. **Ask before building** - When about to write integration code for a protocol/API, pause and ask: "Does an official client library exist for this?"

## Project-Specific Notes

- **x402 payments**: Use `@x402/fetch` + `@x402/evm` for client-side, `@x402/express` for server-side
- **Wallet connections**: Using `@reown/appkit` with Wagmi adapter
- **Network**: Base mainnet (eip155:8453) with USDC
