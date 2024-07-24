import { uploadFile, uploadMetadata } from "@/utils/helpers";
import { Network, ShyftSdk } from "@shyft-to/js";
import {
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
} from "@solana/actions";
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";

export const maxDuration = 300;

const DEFAULT_SOL_ADDRESS: PublicKey = new PublicKey(
  "GqkJ3UoKTScvXiaJUxrGJ9QD847LAj2DTvMzqjaT2tJm"
);

function privateKeyToUint8Array(privateKeyString: string) {
  return new Uint8Array(bs58.decode(privateKeyString));
}

export const GET = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    const { toPubkey } = validatedQueryParams(requestUrl);

    const baseHref = new URL(
      `/api/actions/mint?to=${toPubkey}`,
      requestUrl.origin
    ).toString();

    const payload: ActionGetResponse = {
      title: "PixLink",
      icon: new URL("/pixlink.png", requestUrl.origin).toString(),
      description: "Generate customise PixLink Avatar",
      label: "Generate PixLink",
      links: {
        actions: [
          {
            label: "Mint & Reveal", // button text
            href: `${baseHref}&prompt={prompt}`, // this href will have a text input
            parameters: [
              {
                name: "prompt",
                label: "Enter your prompt to generate PixLink",
                required: true,
              },
            ],
          },
        ],
      },
    };

    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS,
    });
  } catch (err) {
    console.log(err);
    let message = "An unknown error occurred";
    if (typeof err == "string") message = err;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
};

// DO NOT FORGET TO INCLUDE THE `OPTIONS` HTTP METHOD
// THIS WILL ENSURE CORS WORKS FOR BLINKS
export const OPTIONS = GET;

export const POST = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    const { prompt, toPubkey } = validatedQueryParams(requestUrl);
    const body: ActionPostRequest = await req.json();

    // validate the client provided input
    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      return new Response('Invalid "account" provided', {
        status: 400,
        headers: ACTIONS_CORS_HEADERS,
      });
    }

    const secretKeyArray = privateKeyToUint8Array(process.env.PRIVATE_KEY!);

    const wallet = Keypair.fromSecretKey(secretKeyArray);

    const fileUrl = await uploadFile(prompt);

    const url = await uploadMetadata(fileUrl!, account.toBase58());

    const connection = new Connection(process.env.RPC_URL!);

    const transaction = new Transaction();

    const shyft = new ShyftSdk({
      apiKey: process.env.API_KEY!,
      network: Network.Mainnet,
    });

    const tx = await shyft.nft.compressed.mint({
      creatorWallet: "5uUf32tjr8ZJ5cQeYoNwq4nbz1dB5BshcFeyo6VwDSPQ",
      merkleTree: "ByLjz66N93WAFSaF3KWoGvNH1uQbsqH4QD4Eqe7o9jNX",
      collectionAddress: "G8nWR1ufykhpUrJhmJ3iEMukroK5oNQVLrFL79j2U9BD",
      metadataUri: url,
      feePayer: account.toBase58(),
      maxSupply: 1,
      priorityFee: 1000,
      isMutable: true,
      receiver: account.toBase58(),
    });

    const decodedTxn = Transaction.from(
      Buffer.from(tx.encoded_transaction, "base64")
    );

    transaction.add(decodedTxn);

    const senderAccount = getAssociatedTokenAddressSync(
      new PublicKey("SENDdRQtYMWaQrBroBrJ2Q53fgVuq95CV9UPGEvpCxa"),
      account
    );

    const receiverAccount = getAssociatedTokenAddressSync(
      new PublicKey("SENDdRQtYMWaQrBroBrJ2Q53fgVuq95CV9UPGEvpCxa"),
      DEFAULT_SOL_ADDRESS
    );

    transaction.feePayer = account;

    const latestBlockhash = await connection.getLatestBlockhash();

    transaction!.recentBlockhash = latestBlockhash.blockhash;
    transaction!.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    transaction.add(
      createTransferInstruction(
        senderAccount,
        receiverAccount,
        account,
        69 * Math.pow(10, 6)
      )
    );

    transaction.partialSign(wallet);

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `Minted PixLink`,
      },
    });

    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS,
    });
  } catch (err) {
    console.log(err);
    let message = "An unknown error occurred";
    if (typeof err == "string") message = err;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
};

function validatedQueryParams(requestUrl: URL) {
  let toPubkey: PublicKey = DEFAULT_SOL_ADDRESS;
  let prompt = "Cool cat, cartoonist, cute, glasses";

  try {
    if (requestUrl.searchParams.get("to")) {
      toPubkey = new PublicKey(requestUrl.searchParams.get("to")!);
    }
    if (requestUrl.searchParams.get("prompt")) {
      prompt = requestUrl.searchParams.get("prompt")!;
    }
  } catch (err) {
    throw "Invalid input query parameter: prompt";
  }

  return {
    prompt,
    toPubkey,
  };
}
