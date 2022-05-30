import logo from "./logo.svg";
import "./App.css";
import MetaMaskSDK from "@metamask/sdk"
import WC from '@walletconnect/client'
import { useState } from "react";
import { useEffect } from "react";

const sdk = new MetaMaskSDK({ useDeeplink: false, communicationLayerPreference: 'socket' });

function App() {

  const [chain, setChain] = useState('chain')
  const [account, setAccount] = useState('account')

  const connect = () => {
    window.ethereum
      .request({
        method: "eth_requestAccounts",
        params: [],
      })
      .then((res) => console.log("request accounts", res))
      .catch((e) => console.log("request accounts ERR", e));
  };

  const addEthereumChain = () => {
    window.ethereum
      .request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x64",
            chainName: "xDai",
            blockExplorerUrls: ["https://blockscout.com/xdai/mainnet"],
            nativeCurrency: { symbol: "xDai", decimals: 18 },
            rpcUrls: ["https://rpc.xdaichain.com/"],
          },
        ],
      })
      .then((res) => console.log("add", res))
      .catch((e) => console.log("ADD ERR", e));
  };

  useEffect(()=>{
    window.ethereum.on('chainChanged', (chain)=> {
      console.log(chain)
      setChain(chain)
    })
    window.ethereum.on('accountsChanged', (accounts)=> {
      console.log(accounts)
      setAccount(accounts?.[0])
    })
  }, [])

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>

        <button onClick={connect}>Connect</button>

        <button onClick={addEthereumChain}>ADD ETHEREUM CHAIN</button>
        
        {chain}
        <p></p>
        {account}
      </header>
    </div>
  );
}

export default App;
