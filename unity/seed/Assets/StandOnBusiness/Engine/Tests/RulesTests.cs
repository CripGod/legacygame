using NUnit.Framework;
using StandOnBusiness.Engine;

namespace StandOnBusiness.Engine.Tests
{
    public class RulesTests
    {
        [Test]
        public void SweepBonusIsHalfRoundedUp()
        {
            Assert.AreEqual(1, Rules.SweepBonus(1));
            Assert.AreEqual(2, Rules.SweepBonus(4));
            Assert.AreEqual(3, Rules.SweepBonus(5));
            Assert.AreEqual(8, Rules.SweepBonus(16));
        }

        [Test]
        public void StandMultiplierFollowsTheTable()
        {
            Assert.AreEqual(4, Rules.StandMultiplier(1));
            Assert.AreEqual(4, Rules.StandMultiplier(2));
            Assert.AreEqual(3, Rules.StandMultiplier(3));
            Assert.AreEqual(3, Rules.StandMultiplier(5));
            Assert.AreEqual(2, Rules.StandMultiplier(6));
            Assert.AreEqual(2, Rules.StandMultiplier(9));
            Assert.AreEqual(2, Rules.StandMultiplier(40));
            Assert.AreEqual(4, Rules.StandMultiplier(0));
        }

        [Test]
        public void OtherSwapsThePlayers()
        {
            Assert.AreEqual("B", Rules.Other("A"));
            Assert.AreEqual("A", Rules.Other("B"));
        }
    }
}
