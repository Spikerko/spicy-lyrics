let _IsReady = false;

async function IsReady() {
  return new Promise((resolve) => {
    if (_IsReady) {
      resolve(true);
    } else {
      setTimeout(() => IsReady(), 100);
    }
  });
}

function SetReady() {
  _IsReady = true;
}

const App = {
  IsReady,
  SetReady,
};

export default App;