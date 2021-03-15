using System;
using System.Collections.Generic;
using Neo.Persistence;

// It is worth noting this helper method shouldn't be used outside of testing purposes.
namespace NEOONE
{
  partial class Dispatcher
  {
    enum TestMethod
    {
      test_update_store
    }

    public class RawChange
    {
      public byte[] key { get; set; }
      public byte[] value { get; set; }
    }
    private dynamic dispatchTestMethod(TestMethod method, dynamic args)
    {
      switch (method)
      {
        case TestMethod.test_update_store:
          List<RawChange> changes = new List<RawChange> { };
          foreach (dynamic change in args.changes)
          {
            // TODO: check this was right when removing table prefix
            changes.Add(new RawChange() { key = (byte[])change.key, value = (byte[])change.value });
          }
          return this._updateStore(changes.ToArray());
        default:
          throw new InvalidOperationException();
      }
    }

    private bool _updateStore(RawChange[] changes)
    {
      if (this.path != null)
      {
        throw new InvalidOperationException("Must use a memory store for this operation to be useful");
      }

      this.store?.Dispose();
      this.store = null;
      this.store = new MemoryStore();
      foreach (RawChange change in changes)
      {
        this.store.PutSync(change.key, change.value);
      }
      this.snapshot = new SnapshotCache(this.store);
      this.clonedSnapshot = this.snapshot.CreateSnapshot();

      return true;
    }
  }
}
